import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  await prisma.kPI.upsert({
    where: { id: 1 },
    update: {},
    create: { utilization: "—", storageCost: "—", dwellTime: "—", approvalRate: "0%" }
  });

  await prisma.inventory.createMany({
    data: [
      { port: "Hải Phòng", type: "20GP", stock: 320 },
      { port: "Hải Phòng", type: "40HC", stock: 210 },
      { port: "TP.HCM",   type: "20GP", stock: 280 },
      { port: "TP.HCM",   type: "40HC", stock: 420 },
      { port: "Đà Nẵng",  type: "20GP", stock: 160 },
      { port: "Đà Nẵng",  type: "40HC", stock: 90  }
    ]
  });
  console.log("Seeded KPI & Inventory");
}
main().finally(()=>prisma.$disconnect());

