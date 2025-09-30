#!/usr/bin/env python3
"""
Advanced Container Logistics Optimization using Google OR-Tools
Integrates with Node.js ML and LSTM systems for optimal container management
"""

import json
import sys
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
import numpy as np
import pandas as pd

from ortools.linear_solver import pywraplp
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
from ortools.sat.python import cp_model
from ortools.graph.python import max_flow
from ortools.algorithms.python import knapsack_solver

@dataclass
class Port:
    name: str
    current_empty: int
    capacity: int
    demand_forecast: List[int]  # 7-day LSTM forecast
    storage_cost_per_day: float
    handling_cost: float
    coordinates: Tuple[float, float]  # lat, lng

@dataclass
class Container:
    id: str
    type: str  # 20GP, 40GP, 40HC
    current_port: str
    dwell_time: int
    next_booking_port: Optional[str]
    priority: int  # 1-10, higher = more urgent

@dataclass
class Route:
    from_port: str
    to_port: str
    distance_km: float
    transport_cost: float
    transit_time_hours: int
    capacity_teu: int

class ContainerOptimizer:
    """
    Multi-objective container optimization using OR-Tools:
    1. Minimize total cost (storage + transport + handling)
    2. Maximize utilization efficiency
    3. Minimize empty repositioning
    4. Respect capacity constraints
    5. Optimize based on LSTM predictions
    """
    
    def __init__(self):
        self.ports: Dict[str, Port] = {}
        self.containers: List[Container] = []
        self.routes: List[Route] = []
        self.optimization_results = {}
        
    def load_data(self, data: Dict[str, Any]):
        """Load data from Node.js system"""
        try:
            # Parse ports data
            for port_data in data.get('ports', []):
                self.ports[port_data['name']] = Port(
                    name=port_data['name'],
                    current_empty=port_data['current_empty'],
                    capacity=port_data['capacity'],
                    demand_forecast=port_data['lstm_forecast'],  # From LSTM
                    storage_cost_per_day=port_data['storage_cost'],
                    handling_cost=port_data['handling_cost'],
                    coordinates=(port_data['lat'], port_data['lng'])
                )
            
            # Parse containers data
            for container_data in data.get('containers', []):
                self.containers.append(Container(
                    id=container_data['id'],
                    type=container_data['type'],
                    current_port=container_data['current_port'],
                    dwell_time=container_data['dwell_time'],
                    next_booking_port=container_data.get('next_booking_port'),
                    priority=container_data['priority']
                ))
            
            # Parse routes data
            for route_data in data.get('routes', []):
                self.routes.append(Route(
                    from_port=route_data['from'],
                    to_port=route_data['to'],
                    distance_km=route_data['distance'],
                    transport_cost=route_data['cost'],
                    transit_time_hours=route_data['transit_time'],
                    capacity_teu=route_data['capacity']
                ))
                
            return True
            
        except Exception as e:
            print(f"Error loading data: {str(e)}", file=sys.stderr)
            return False

    def optimize_container_redistribution(self) -> Dict[str, Any]:
        """
        Multi-Commodity Flow optimization for container redistribution
        Considers LSTM forecasts for demand planning
        """
        
        # Create solver
        solver = pywraplp.Solver.CreateSolver('SCIP')
        if not solver:
            return {"error": "SCIP solver not available"}

        try:
            port_names = list(self.ports.keys())
            container_types = list(set(c.type for c in self.containers))
            time_horizon = 7  # 7-day optimization window
            
            # Decision variables: flow[from_port][to_port][container_type][time]
            flow = {}
            for from_port in port_names:
                flow[from_port] = {}
                for to_port in port_names:
                    if from_port != to_port:
                        flow[from_port][to_port] = {}
                        for ctype in container_types:
                            flow[from_port][to_port][ctype] = [
                                solver.IntVar(0, 1000, f'flow_{from_port}_{to_port}_{ctype}_{t}')
                                for t in range(time_horizon)
                            ]

            # Storage variables: storage[port][container_type][time]
            storage = {}
            for port in port_names:
                storage[port] = {}
                for ctype in container_types:
                    storage[port][ctype] = [
                        solver.IntVar(0, self.ports[port].capacity, f'storage_{port}_{ctype}_{t}')
                        for t in range(time_horizon)
                    ]

            # Objective: Minimize total cost
            objective_terms = []

            # Storage costs
            for port in port_names:
                port_obj = self.ports[port]
                for ctype in container_types:
                    for t in range(time_horizon):
                        cost_coeff = port_obj.storage_cost_per_day
                        objective_terms.append(cost_coeff * storage[port][ctype][t])

            # Transportation costs
            for from_port in port_names:
                for to_port in port_names:
                    if from_port != to_port:
                        # Find route cost
                        route_cost = 50  # Default cost
                        for route in self.routes:
                            if route.from_port == from_port and route.to_port == to_port:
                                route_cost = route.transport_cost
                                break
                        
                        for ctype in container_types:
                            for t in range(time_horizon):
                                objective_terms.append(
                                    route_cost * flow[from_port][to_port][ctype][t]
                                )

            solver.Minimize(solver.Sum(objective_terms))

            # Constraints
            
            # 1. Flow conservation at each port
            for port in port_names:
                for ctype in container_types:
                    for t in range(time_horizon):
                        # Current inventory at port for this type
                        current_inventory = len([c for c in self.containers 
                                               if c.current_port == port and c.type == ctype])
                        
                        if t == 0:
                            # Initial balance
                            inflow = solver.Sum([flow[other][port][ctype][t] 
                                               for other in port_names if other != port])
                            outflow = solver.Sum([flow[port][other][ctype][t] 
                                                for other in port_names if other != port])
                            
                            solver.Add(storage[port][ctype][t] == 
                                     current_inventory + inflow - outflow)
                        else:
                            # Subsequent periods
                            inflow = solver.Sum([flow[other][port][ctype][t] 
                                               for other in port_names if other != port])
                            outflow = solver.Sum([flow[port][other][ctype][t] 
                                                for other in port_names if other != port])
                            
                            # Add LSTM demand forecast
                            lstm_demand = 0
                            if t < len(self.ports[port].demand_forecast):
                                lstm_demand = self.ports[port].demand_forecast[t]
                            
                            solver.Add(storage[port][ctype][t] == 
                                     storage[port][ctype][t-1] + inflow - outflow - lstm_demand)

            # 2. Capacity constraints
            for port in port_names:
                for t in range(time_horizon):
                    total_storage = solver.Sum([storage[port][ctype][t] 
                                              for ctype in container_types])
                    solver.Add(total_storage <= self.ports[port].capacity)

            # 3. Route capacity constraints
            for from_port in port_names:
                for to_port in port_names:
                    if from_port != to_port:
                        # Find route capacity
                        route_capacity = 100  # Default
                        for route in self.routes:
                            if route.from_port == from_port and route.to_port == to_port:
                                route_capacity = route.capacity_teu
                                break
                        
                        for t in range(time_horizon):
                            total_flow = solver.Sum([flow[from_port][to_port][ctype][t] 
                                                   for ctype in container_types])
                            solver.Add(total_flow <= route_capacity)

            # Solve
            print(f"🔧 Starting OR-Tools optimization with {len(self.containers)} containers across {len(port_names)} ports...")
            
            status = solver.Solve()
            
            if status == pywraplp.Solver.OPTIMAL:
                return self._extract_redistribution_solution(solver, flow, storage, port_names, container_types, time_horizon)
            else:
                return {
                    "error": f"Optimization failed with status: {status}",
                    "fallback_solution": self._create_fallback_solution()
                }

        except Exception as e:
            print(f"Error in optimization: {str(e)}", file=sys.stderr)
            return {
                "error": str(e),
                "fallback_solution": self._create_fallback_solution()
            }

    def optimize_vehicle_routing(self, relocations: List[Dict]) -> Dict[str, Any]:
        """
        Vehicle Routing Problem for efficient empty container pickup/delivery
        """
        try:
            if not relocations:
                return {"routes": [], "total_cost": 0, "total_distance": 0}

            # Create routing model
            manager = pywrapcp.RoutingIndexManager(
                len(relocations) + 1,  # +1 for depot
                1,  # number of vehicles
                0   # depot index
            )
            
            routing = pywrapcp.RoutingModel(manager)

            # Distance callback
            def distance_callback(from_index, to_index):
                from_node = manager.IndexToNode(from_index)
                to_node = manager.IndexToNode(to_index)
                
                if from_node == 0 or to_node == 0:  # depot
                    return 0
                
                # Calculate distance between ports
                from_port = relocations[from_node - 1]['from_port']
                to_port = relocations[to_node - 1]['to_port']
                
                # Find route distance
                for route in self.routes:
                    if route.from_port == from_port and route.to_port == to_port:
                        return int(route.distance_km)
                
                return 1000  # High penalty for unknown routes

            transit_callback_index = routing.RegisterTransitCallback(distance_callback)
            routing.SetArcCostEvaluatorOfAllVehicles(transit_callback_index)

            # Add capacity constraint
            def demand_callback(from_index):
                from_node = manager.IndexToNode(from_index)
                if from_node == 0:  # depot
                    return 0
                return relocations[from_node - 1]['container_count']

            demand_callback_index = routing.RegisterUnaryTransitCallback(demand_callback)
            routing.AddDimensionWithVehicleCapacity(
                demand_callback_index,
                0,  # null capacity slack
                [100],  # vehicle maximum capacity
                True,  # start cumul to zero
                'Capacity'
            )

            # Solve
            search_parameters = pywrapcp.DefaultRoutingSearchParameters()
            search_parameters.first_solution_strategy = (
                routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
            )

            solution = routing.SolveWithParameters(search_parameters)
            
            if solution:
                return self._extract_routing_solution(manager, routing, solution, relocations)
            else:
                return {"error": "No solution found for vehicle routing"}

        except Exception as e:
            print(f"Error in vehicle routing: {str(e)}", file=sys.stderr)
            return {"error": str(e)}

    def optimize_assignment(self, containers: List[Dict], demands: List[Dict]) -> Dict[str, Any]:
        """
        Assignment Problem: Optimally assign containers to future bookings
        """
        try:
            if not containers or not demands:
                return {"assignments": [], "unassigned_containers": containers}

            # Create assignment solver
            solver = pywraplp.Solver.CreateSolver('SCIP')
            if not solver:
                return {"error": "Assignment solver not available"}

            # Decision variables: x[i][j] = 1 if container i is assigned to demand j
            x = {}
            for i, container in enumerate(containers):
                x[i] = {}
                for j, demand in enumerate(demands):
                    x[i][j] = solver.IntVar(0, 1, f'assign_{i}_{j}')

            # Objective: Minimize total assignment cost
            objective_terms = []
            for i, container in enumerate(containers):
                for j, demand in enumerate(demands):
                    # Calculate assignment cost based on:
                    # 1. Distance between current port and demand port
                    # 2. Container type compatibility
                    # 3. Priority/urgency
                    
                    cost = self._calculate_assignment_cost(container, demand)
                    objective_terms.append(cost * x[i][j])

            solver.Minimize(solver.Sum(objective_terms))

            # Constraints
            
            # Each container can be assigned to at most one demand
            for i in range(len(containers)):
                solver.Add(solver.Sum([x[i][j] for j in range(len(demands))]) <= 1)

            # Each demand can be satisfied by at most one container
            for j in range(len(demands)):
                solver.Add(solver.Sum([x[i][j] for i in range(len(containers))]) <= 1)

            # Type compatibility constraints
            for i, container in enumerate(containers):
                for j, demand in enumerate(demands):
                    if not self._is_compatible(container['type'], demand['required_type']):
                        solver.Add(x[i][j] == 0)

            # Solve
            status = solver.Solve()
            
            if status == pywraplp.Solver.OPTIMAL:
                return self._extract_assignment_solution(solver, x, containers, demands)
            else:
                return {"error": f"Assignment optimization failed: {status}"}

        except Exception as e:
            print(f"Error in assignment optimization: {str(e)}", file=sys.stderr)
            return {"error": str(e)}

    def _extract_redistribution_solution(self, solver, flow, storage, port_names, container_types, time_horizon):
        """Extract solution from redistribution optimization"""
        solution = {
            "status": "optimal",
            "total_cost": solver.Objective().Value(),
            "relocations": [],
            "storage_plan": {},
            "recommendations": []
        }
        
        # Extract relocations
        for from_port in port_names:
            for to_port in port_names:
                if from_port != to_port:
                    for ctype in container_types:
                        for t in range(time_horizon):
                            flow_value = flow[from_port][to_port][ctype][t].solution_value()
                            if flow_value > 0:
                                solution["relocations"].append({
                                    "from_port": from_port,
                                    "to_port": to_port,
                                    "container_type": ctype,
                                    "quantity": int(flow_value),
                                    "day": t + 1,
                                    "priority": "high" if t <= 2 else "medium"
                                })

        # Extract storage plan
        for port in port_names:
            solution["storage_plan"][port] = {}
            for ctype in container_types:
                solution["storage_plan"][port][ctype] = [
                    int(storage[port][ctype][t].solution_value())
                    for t in range(time_horizon)
                ]

        # Generate recommendations
        solution["recommendations"] = self._generate_recommendations(solution)
        
        return solution

    def _extract_routing_solution(self, manager, routing, solution, relocations):
        """Extract vehicle routing solution"""
        route_data = {
            "total_distance": solution.ObjectiveValue(),
            "routes": []
        }
        
        vehicle_id = 0
        index = routing.Start(vehicle_id)
        route = []
        
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node > 0:  # Skip depot
                route.append(relocations[node - 1])
            index = solution.Value(routing.NextVar(index))
        
        route_data["routes"] = [route]
        return route_data

    def _extract_assignment_solution(self, solver, x, containers, demands):
        """Extract assignment solution"""
        solution = {
            "assignments": [],
            "unassigned_containers": [],
            "unmet_demands": [],
            "total_cost": solver.Objective().Value()
        }
        
        assigned_containers = set()
        assigned_demands = set()
        
        for i, container in enumerate(containers):
            for j, demand in enumerate(demands):
                if x[i][j].solution_value() > 0.5:  # Assigned
                    solution["assignments"].append({
                        "container_id": container['id'],
                        "demand_id": demand['id'],
                        "from_port": container['current_port'],
                        "to_port": demand['port'],
                        "container_type": container['type'],
                        "cost": self._calculate_assignment_cost(container, demand)
                    })
                    assigned_containers.add(i)
                    assigned_demands.add(j)
        
        # Unassigned items
        solution["unassigned_containers"] = [
            containers[i] for i in range(len(containers)) if i not in assigned_containers
        ]
        solution["unmet_demands"] = [
            demands[j] for j in range(len(demands)) if j not in assigned_demands
        ]
        
        return solution

    def _calculate_assignment_cost(self, container: Dict, demand: Dict) -> float:
        """Calculate cost of assigning container to demand"""
        base_cost = 10
        
        # Distance cost
        from_port = container['current_port']
        to_port = demand['port']
        distance_cost = 0
        
        for route in self.routes:
            if route.from_port == from_port and route.to_port == to_port:
                distance_cost = route.transport_cost
                break
        
        # Type mismatch penalty
        type_penalty = 0 if self._is_compatible(container['type'], demand['required_type']) else 1000
        
        # Urgency bonus
        urgency_bonus = -demand.get('priority', 0) * 5
        
        return base_cost + distance_cost + type_penalty + urgency_bonus

    def _is_compatible(self, container_type: str, required_type: str) -> bool:
        """Check if container type is compatible with requirement"""
        compatibility_map = {
            '20GP': ['20GP'],
            '40GP': ['40GP', '40HC'],
            '40HC': ['40HC', '40GP']
        }
        
        return required_type in compatibility_map.get(container_type, [])

    def _create_fallback_solution(self):
        """Create a simple fallback solution when optimization fails"""
        return {
            "status": "fallback",
            "relocations": [],
            "recommendations": [
                "Optimization solver failed - using simple heuristics",
                "Consider manual review of container distribution",
                "Check data quality and constraints"
            ]
        }

    def _generate_recommendations(self, solution):
        """Generate actionable recommendations based on optimization results"""
        recommendations = []
        
        if solution["relocations"]:
            urgent_relocations = [r for r in solution["relocations"] if r["priority"] == "high"]
            if urgent_relocations:
                recommendations.append(
                    f"🚨 {len(urgent_relocations)} urgent relocations needed within 3 days"
                )
            
            total_movements = len(solution["relocations"])
            recommendations.append(
                f"📦 Total optimized movements: {total_movements} container relocations"
            )
        
        # Cost analysis
        if "total_cost" in solution:
            recommendations.append(
                f"💰 Estimated total cost: ${solution['total_cost']:,.2f}"
            )
        
        return recommendations

def main():
    """Main function for CLI usage"""
    if len(sys.argv) < 2:
        print("Usage: python container_optimizer.py <input_json_file>", file=sys.stderr)
        sys.exit(1)
    
    try:
        # Load input data
        with open(sys.argv[1], 'r') as f:
            input_data = json.load(f)
        
        # Initialize optimizer
        optimizer = ContainerOptimizer()
        
        if not optimizer.load_data(input_data):
            print('{"error": "Failed to load input data"}')
            sys.exit(1)
        
        # Determine optimization type
        optimization_type = input_data.get('optimization_type', 'redistribution')
        
        if optimization_type == 'redistribution':
            result = optimizer.optimize_container_redistribution()
        elif optimization_type == 'routing':
            relocations = input_data.get('relocations', [])
            result = optimizer.optimize_vehicle_routing(relocations)
        elif optimization_type == 'assignment':
            containers = input_data.get('containers', [])
            demands = input_data.get('demands', [])
            result = optimizer.optimize_assignment(containers, demands)
        else:
            result = {"error": f"Unknown optimization type: {optimization_type}"}
        
        # Output result as JSON
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        error_result = {"error": str(e)}
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()