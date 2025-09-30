#!/bin/bash

# Deploy to Kubernetes
echo "🚀 Deploying AI Container app to Kubernetes..."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl not found. Please install kubectl first."
    exit 1
fi

# Build Docker image
echo "🔨 Building Docker image..."
docker build -t ai-cont-app:latest .

# For local clusters (minikube/kind), load the image
if kubectl get nodes | grep -q "minikube\|kind"; then
    echo "📦 Loading image to local cluster..."
    if command -v minikube &> /dev/null; then
        minikube image load ai-cont-app:latest
    elif command -v kind &> /dev/null; then
        kind load docker-image ai-cont-app:latest
    fi
fi

# Apply Kubernetes manifests
echo "📋 Applying Kubernetes manifests..."
kubectl apply -k k8s/

# Wait for deployments to be ready
echo "⏳ Waiting for deployments to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/postgres -n ai-cont
kubectl wait --for=condition=available --timeout=300s deployment/ai-cont-app -n ai-cont

# Get service information
echo "📊 Service information:"
kubectl get services -n ai-cont

# Get external IP/URL
SERVICE_TYPE=$(kubectl get service ai-cont-app-service -n ai-cont -o jsonpath='{.spec.type}')
if [ "$SERVICE_TYPE" = "LoadBalancer" ]; then
    echo "⏳ Waiting for LoadBalancer IP..."
    kubectl get service ai-cont-app-service -n ai-cont -w
else
    echo "🌐 Use port-forward to access the application:"
    echo "kubectl port-forward service/ai-cont-app-service -n ai-cont 3000:80"
fi

echo "✅ Deployment complete!"