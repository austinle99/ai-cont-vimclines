"use server";

import { prisma } from "@/lib/db";
import { getSafety } from "@/lib/safetyStock";
import * as ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";

// ---- Helpers ----
function computeProposals(inventory: {port:string; type:string; stock:number}[],
                          bookings: {destination:string; size:string; qty:number}[]) {
  // demand by (port,type)
  const demand = new Map<string, number>();
  for (const b of bookings) {
    const k = `${b.destination}|${b.size}`;
    demand.set(k, (demand.get(k) || 0) + Number(b.qty || 0));
  }
  // balance per (port,type)
  const balance = new Map<string, number>();
  for (const inv of inventory) {
    const k = `${inv.port}|${inv.type}`;
    const needHere = demand.get(k) || 0;
    const safety = getSafety(inv.port, inv.type);
    balance.set(k, (inv.stock || 0) - safety - needHere);
  }
  const invIndex = new Map(inventory.map(i => [`${i.port}|${i.type}`, i]));
  const surplus = [...balance.entries()].filter(([_,v])=>v>0).map(([k,v])=>{
    const [port,type]=k.split("|"); return { port, type, qty: v };
  });
  const deficit = [...balance.entries()].filter(([_,v])=>v<0).map(([k,v])=>{
    const [port,type]=k.split("|"); return { port, type, qty: -v };
  });

  const out: any[] = []; let idx = 1;
  for (const d of deficit) {
    let need = d.qty;
    for (const s of surplus) {
      if (s.type !== d.type || need <= 0) continue;
      const mv = Math.min(s.qty, need);
      if (mv <= 0) continue;
      s.qty -= mv; need -= mv;
      out.push({
        id: `P${String(idx).padStart(4,"0")}`,
        route: `${s.port} → ${d.port}`,
        size: d.type,
        qty: mv,
        reason: `Thiếu tại ${d.port}, dư tại ${s.port} (đã xét safety)`,
        status: "draft" as const
      });
      idx++;
    }
  }
  return out;
}

// ---- Actions ----
export async function importExcel(formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("Thiếu file Excel");
  const arrayBuffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  // Helper function to convert worksheet to JSON
  const sheetToJson = (worksheetName: string) => {
    const worksheet = wb.getWorksheet(worksheetName);
    if (!worksheet) return [];
    
    const data: any[] = [];
    const headers: string[] = [];
    
    // Get headers from first row
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value);
    });
    
    // Get data from remaining rows
    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const rowData: any = {};
      
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (header) {
          rowData[header] = cell.value;
        }
      });
      
      // Only add row if it has data
      if (Object.keys(rowData).length > 0) {
        data.push(rowData);
      }
    }
    
    return data;
  };

  const invRaw = sheetToJson("inventory_snapshot");
  const bkRaw = sheetToJson("bookings_demand");

  const inv = invRaw.map(r => ({
    port: r.port || r.depot || r.depot_code || "",
    type: r.type || r.container_type || "",
    stock: Number(r.stock ?? r.qty_available ?? r.qty ?? 0)
  })).filter(r => r.port && r.type);

  const bookings = bkRaw.map(r => ({
    date: r.date ? new Date(r.date) : new Date(),
    origin: r.origin || r.origin_depot || "",
    destination: r.destination || r.destination_depot || r.port || "",
    size: r.size || r.container_type || "",
    qty: Number(r.qty ?? r.demand_teu ?? 0),
    status: r.status || "forecast"
  })).filter(r => r.origin && r.destination && r.size);

  // upsert (simple: truncate & insert)
  await prisma.$transaction([
    prisma.inventory.deleteMany({}),
    prisma.booking.deleteMany({})
  ]);
  if (inv.length) await prisma.inventory.createMany({ data: inv });
  if (bookings.length) await prisma.booking.createMany({ data: bookings });

  // recompute proposals and generate alerts
  await recomputeProposals();
  await recomputeKPI();
  await generateAlerts();

  revalidatePath("/");
  revalidatePath("/proposals");
  revalidatePath("/reports");
  revalidatePath("/notifications");
}

export async function recomputeProposals() {
  const [inventory, bookings] = await Promise.all([
    prisma.inventory.findMany(),
    prisma.booking.findMany()
  ]);

  const aggBookings = bookings.map((b: any) => ({ destination: b.destination, size: b.size, qty: b.qty }));
  const inv = inventory.map((i: any) => ({ port: i.port, type: i.type, stock: i.stock }));
  const proposals = computeProposals(inv, aggBookings);

  await prisma.proposal.deleteMany({});
  if (proposals.length) {
    await prisma.proposal.createMany({
      data: proposals.map(p => ({
        id: p.id, route: p.route, size: p.size, qty: p.qty,
        reason: p.reason, status: p.status
      }))
    });
  }
}

export async function approveProposal(id: string) {
  await prisma.proposal.update({ where: { id }, data: { status: "approved" } });
  await recomputeKPI();
  await generateAlerts();
  revalidatePath("/proposals");
  revalidatePath("/reports");
  revalidatePath("/notifications");
}

export async function rejectProposal(id: string) {
  await prisma.proposal.update({ where: { id }, data: { status: "rejected" } });
  await recomputeKPI();
  await generateAlerts();
  revalidatePath("/proposals");
  revalidatePath("/reports");
  revalidatePath("/notifications");
}

export async function recomputeKPI() {
  const [kpi, proposals] = await Promise.all([
    prisma.kPI.findFirst(),
    prisma.proposal.findMany()
  ]);
  const total = proposals.length || 1;
  const approved = proposals.filter((p: any) => p.status === "approved").length;
  const next = {
    utilization: kpi?.utilization ?? "84%",
    storageCost: kpi?.storageCost ?? "2.3 tỷ VND",
    dwellTime: kpi?.dwellTime ?? "3.6 ngày",
    approvalRate: Math.round((approved/total)*100) + "%"
  };
  if (!kpi) await prisma.kPI.create({ data: next });
  else await prisma.kPI.update({ where: { id: kpi.id }, data: next });
}

// ---- Alert System ----
export async function generateAlerts() {
  const inventory = await prisma.inventory.findMany();
  const bookings = await prisma.booking.findMany();
  const proposals = await prisma.proposal.findMany();
  
  // Clear existing active alerts to regenerate
  await prisma.alert.deleteMany({ where: { status: "active" } });
  
  const alerts: any[] = [];
  let alertId = 1;
  
  // Generate inventory-based alerts
  for (const inv of inventory) {
    const safety = getSafety(inv.port, inv.type);
    const relatedBookings = bookings.filter(b => b.destination === inv.port && b.size === inv.type);
    const demand = relatedBookings.reduce((sum, b) => sum + b.qty, 0);
    
    // Critical shortage alert
    if (inv.stock < safety) {
      alerts.push({
        id: `A${String(alertId++).padStart(4, "0")}`,
        level: "Cao",
        message: `${inv.port} thiếu ${inv.type}, cần chuyển gấp`,
        location: inv.port,
        severity: "Critical",
        description: `Container ${inv.type} shortage detected at ${inv.port} port. Current stock: ${inv.stock} containers, Safety stock: ${safety}. Immediate transfer required to meet safety requirements. Deficit: ${safety - inv.stock} containers.`,
        status: "active"
      });
    }
    // Medium level alert for low stock
    else if (inv.stock < safety * 1.5) {
      alerts.push({
        id: `A${String(alertId++).padStart(4, "0")}`,
        level: "TB",
        message: `${inv.port} ${inv.type} cần xem xét bổ sung`,
        location: inv.port,
        severity: "Medium",
        description: `${inv.type} container inventory running low at ${inv.port}. Current stock: ${inv.stock} containers, Safety level: ${safety}. Recommended action: Schedule replenishment within 72 hours to avoid shortage.`,
        status: "active"
      });
    }
    
    // High inventory alert
    if (inv.stock > safety * 3) {
      alerts.push({
        id: `A${String(alertId++).padStart(4, "0")}`,
        level: "Thấp",
        message: `${inv.port} tồn cao, theo dõi`,
        location: inv.port,
        severity: "Low",
        description: `High inventory levels detected at ${inv.port} port. Current stock: ${inv.stock} containers, optimal level: ${safety * 2}. Current excess: ${inv.stock - safety * 2} containers above optimal level. Monitor for potential storage cost increases and consider redistribution.`,
        status: "active"
      });
    }
  }
  
  // Generate proposal-based alerts
  const pendingProposals = proposals.filter(p => p.status === "draft");
  if (pendingProposals.length > 10) {
    alerts.push({
      id: `A${String(alertId++).padStart(4, "0")}`,
      level: "TB",
      message: `${pendingProposals.length} đề xuất chờ phê duyệt`,
      location: "System",
      severity: "Medium",
      description: `High number of pending proposals requiring approval. Current pending: ${pendingProposals.length} proposals. This may delay container movements and affect operational efficiency. Consider prioritizing proposal reviews.`,
      status: "active"
    });
  }
  
  // Generate efficiency alerts based on KPI
  const kpi = await prisma.kPI.findFirst();
  if (kpi) {
    const approvalRate = parseInt(kpi.approvalRate.replace('%', ''));
    if (approvalRate < 70) {
      alerts.push({
        id: `A${String(alertId++).padStart(4, "0")}`,
        level: "Cao",
        message: `Tỷ lệ phê duyệt thấp: ${kpi.approvalRate}`,
        location: "System",
        severity: "Critical",
        description: `Low proposal approval rate detected: ${kpi.approvalRate}. This indicates potential issues with proposal quality or approval process efficiency. Current rate is below 70% threshold. Review proposal criteria and approval workflow.`,
        status: "active"
      });
    }
  }
  
  // Save alerts to database
  if (alerts.length > 0) {
    await prisma.alert.createMany({ data: alerts });
  }
  
  return alerts;
}

export async function resolveAlert(formData: FormData) {
  const id = formData.get("id") as string;
  await prisma.alert.update({
    where: { id },
    data: {
      status: "resolved",
      resolvedAt: new Date()
    }
  });
  revalidatePath("/notifications");
}

export async function ignoreAlert(formData: FormData) {
  const id = formData.get("id") as string;
  await prisma.alert.update({
    where: { id },
    data: {
      status: "ignored",
      resolvedAt: new Date()
    }
  });
  revalidatePath("/notifications");
}

// Enhanced Chat Assistant with Action Capabilities
export async function askChat(q: string): Promise<{ message: string; action?: string; actionData?: any }> {
  const [kpi, inv, props, alerts, bookings] = await Promise.all([
    prisma.kPI.findFirst(),
    prisma.inventory.findMany(),
    prisma.proposal.findMany(),
    prisma.alert.findMany({ where: { status: "active" }, orderBy: { createdAt: "desc" } }),
    prisma.booking.findMany({ take: 10, orderBy: { date: "desc" } })
  ]);

  const query = q.toLowerCase().trim();

  // Action Detection - Check if user wants to execute an action
  if (query.includes("approve") || query.includes("phê duyệt") || query.includes("duyệt")) {
    const proposalMatch = q.match(/P\d{4}/i);
    if (proposalMatch) {
      return {
        message: `Đang thực hiện phê duyệt đề xuất ${proposalMatch[0]}...`,
        action: "approve_proposal",
        actionData: { id: proposalMatch[0] }
      };
    }
    const pendingProps = props.filter(p => p.status === "draft");
    if (pendingProps.length > 0) {
      return {
        message: `Tìm thấy ${pendingProps.length} đề xuất chờ phê duyệt:\n${pendingProps.slice(0,3).map(p => `- ${p.id}: ${p.route} (${p.qty} TEU ${p.size})`).join("\n")}\n\nGõ "phê duyệt P0001" để phê duyệt đề xuất cụ thể.`
      };
    }
  }

  if (query.includes("reject") || query.includes("từ chối")) {
    const proposalMatch = q.match(/P\d{4}/i);
    if (proposalMatch) {
      return {
        message: `Đang thực hiện từ chối đề xuất ${proposalMatch[0]}...`,
        action: "reject_proposal",
        actionData: { id: proposalMatch[0] }
      };
    }
  }

  if (query.includes("recompute") || query.includes("tính lại") || query.includes("cập nhật")) {
    return {
      message: "Đang tính toán lại đề xuất dựa trên tồn kho và nhu cầu hiện tại...",
      action: "recompute_proposals"
    };
  }

  if (query.includes("resolve alert") || query.includes("giải quyết cảnh báo")) {
    const alertMatch = q.match(/A\d{4}/i);
    if (alertMatch) {
      return {
        message: `Đang giải quyết cảnh báo ${alertMatch[0]}...`,
        action: "resolve_alert",
        actionData: { id: alertMatch[0] }
      };
    }
  }

  // Comprehensive Information Queries with Suggestions
  if (/kpi|hiệu suất|performance/i.test(query)) {
    const suggestions = [];
    if (kpi) {
      const approvalRate = parseInt(kpi.approvalRate.replace('%', ''));
      if (approvalRate < 80) suggestions.push("💡 Nên xem xét lại tiêu chí đề xuất để cải thiện tỷ lệ phê duyệt");
      if (kpi.dwellTime.includes("3.")) suggestions.push("💡 Thời gian lưu trữ có thể tối ưu hóa - xem xét hiệu quả di chuyển container");
    }
    
    return {
      message: `📊 **Tình trạng KPI hiện tại:**\n• Tỷ lệ sử dụng: ${kpi?.utilization || "Không có"}\n• Chi phí lưu trữ: ${kpi?.storageCost || "Không có"}\n• Thời gian lưu trữ: ${kpi?.dwellTime || "Không có"}\n• Tỷ lệ phê duyệt: ${kpi?.approvalRate || "Không có"}\n\n${suggestions.length ? "**Gợi ý:**\n" + suggestions.join("\n") : ""}`
    };
  }

  if (/inventory|tồn kho|stock/i.test(query)) {
    const lowStock = inv.filter(i => {
      const safety = getSafety(i.port, i.type);
      return i.stock < safety;
    });
    const highStock = inv.filter(i => {
      const safety = getSafety(i.port, i.type);
      return i.stock > safety * 3;
    });
    
    const topStock = inv.slice(0, 6).map(r => `• ${r.port} ${r.type}: ${r.stock} TEU`).join("\n");
    let suggestions = [];
    
    if (lowStock.length > 0) {
      suggestions.push(`⚠️ ${lowStock.length} vị trí dưới mức an toàn - cân nhắc chuyển kho ngay`);
    }
    if (highStock.length > 0) {
      suggestions.push(`📦 ${highStock.length} vị trí dư thừa tồn kho - cơ hội phân phối lại`);
    }
    
    return {
      message: `📦 **Tổng quan tồn kho:**\n${topStock}\n\n${suggestions.length ? "**Gợi ý:**\n" + suggestions.join("\n") : ""}${lowStock.length > 0 ? "\n\n**Hành động khẩn cấp:** Gõ 'tính lại' để tạo đề xuất chuyển kho mới" : ""}`
    };
  }

  if (/proposal|đề xuất/i.test(query)) {
    const pending = props.filter(p => p.status === "draft");
    const approved = props.filter(p => p.status === "approved");
    const rejected = props.filter(p => p.status === "rejected");
    
    const recent = props.slice(0, 6).map(p => `• ${p.id} ${p.route} - ${p.qty} TEU ${p.size} (${p.status})`).join("\n");
    
    let suggestions = [];
    if (pending.length > 10) suggestions.push("⏰ Số lượng đề xuất chờ xử lý cao - ưu tiên xem xét");
    if (pending.length > 0) suggestions.push(`📋 Gõ "phê duyệt P0001" để phê duyệt đề xuất cụ thể`);
    
    return {
      message: `📋 **Trạng thái đề xuất:**\n• Chờ xử lý: ${pending.length}\n• Đã phê duyệt: ${approved.length}\n• Đã từ chối: ${rejected.length}\n\n**Đề xuất gần đây:**\n${recent}\n\n${suggestions.length ? "**Gợi ý:**\n" + suggestions.join("\n") : ""}`
    };
  }

  if (/alert|cảnh báo|warning/i.test(query)) {
    const criticalAlerts = alerts.filter(a => a.level === "Cao");
    const mediumAlerts = alerts.filter(a => a.level === "TB");
    
    const recent = alerts.slice(0, 5).map(a => `• ${a.id} [${a.level}] ${a.message}`).join("\n");
    
    let suggestions = [];
    if (criticalAlerts.length > 0) suggestions.push("🚨 Cần hành động ngay lập tức cho cảnh báo quan trọng");
    if (alerts.length > 0) suggestions.push("💡 Gõ 'giải quyết cảnh báo A0001' để giải quyết cảnh báo cụ thể");
    
    return {
      message: `🚨 **Cảnh báo đang hoạt động:**\n• Quan trọng: ${criticalAlerts.length}\n• Trung bình: ${mediumAlerts.length}\n• Thấp: ${alerts.length - criticalAlerts.length - mediumAlerts.length}\n\n**Cảnh báo gần đây:**\n${recent}\n\n${suggestions.length ? "**Hành động cần thực hiện:**\n" + suggestions.join("\n") : ""}`
    };
  }

  if (/suggest|gợi ý|recommend|khuyến nghị/i.test(query)) {
    const suggestions = [];
    
    // Analyze current state and provide comprehensive suggestions
    const criticalAlerts = alerts.filter(a => a.level === "Cao");
    const pendingProps = props.filter(p => p.status === "draft");
    
    if (criticalAlerts.length > 0) {
      suggestions.push("🚨 **Ưu tiên 1:** Giải quyết thiếu hụt tồn kho quan trọng ngay lập tức");
    }
    if (pendingProps.length > 5) {
      suggestions.push("⏰ **Ưu tiên 2:** Xem xét và phê duyệt các đề xuất chuyển kho chờ xử lý");
    }
    
    const lowStock = inv.filter(i => {
      const safety = getSafety(i.port, i.type);
      return i.stock < safety * 1.5;
    });
    if (lowStock.length > 0) {
      suggestions.push("📦 **Ưu tiên 3:** Theo dõi mức tồn kho tại các vị trí có rủi ro");
    }
    
    suggestions.push("🔄 **Hành động thường xuyên:** Gõ 'tính lại' sau khi có đặt hàng mới để tối ưu hóa chuyển kho");
    suggestions.push("📊 **Theo dõi:** Kiểm tra xu hướng KPI hàng tuần để nắm bắt hiệu suất");
    
    return {
      message: `💡 **Khuyến nghị thông minh dựa trên dữ liệu hiện tại:**\n\n${suggestions.join("\n\n")}\n\n**Lệnh nhanh:**\n• "phê duyệt P0001" - Phê duyệt đề xuất\n• "tính lại" - Cập nhật tất cả đề xuất\n• "giải quyết cảnh báo A0001" - Đóng cảnh báo`
    };
  }

  if (/help|trợ giúp|hướng dẫn/i.test(query)) {
    return {
      message: `🤖 **Các lệnh và khả năng của Chatbot:**\n\n**Truy vấn thông tin:**\n• "KPI" - Xem chỉ số hiệu suất\n• "tồn kho" - Kiểm tra mức tồn\n• "đề xuất" - Xem xét kế hoạch chuyển kho\n• "cảnh báo" - Xem cảnh báo đang hoạt động\n• "gợi ý" - Nhận khuyến nghị thông minh\n\n**Lệnh hành động:**\n• "phê duyệt P0001" - Phê duyệt đề xuất cụ thể\n• "từ chối P0002" - Từ chối đề xuất\n• "tính lại" - Tính toán lại tất cả đề xuất\n• "giải quyết cảnh báo A0001" - Đóng cảnh báo\n\n**Tính năng thông minh:**\n• Gợi ý dựa trên ngữ cảnh sau khi import báo cáo\n• Tự động nhận diện và thực hiện hành động\n• Phân tích toàn diện với những thông tin hữu ích`
    };
  }

  // Default response with context-aware suggestions
  const suggestions = [];
  const criticalIssues = alerts.filter(a => a.level === "Cao").length;
  const pendingActions = props.filter(p => p.status === "draft").length;
  
  if (criticalIssues > 0) suggestions.push(`🚨 ${criticalIssues} cảnh báo quan trọng cần chú ý`);
  if (pendingActions > 0) suggestions.push(`📋 ${pendingActions} đề xuất chờ phê duyệt`);
  
  return {
    message: `🤖 **Tôi có thể giúp bạn tối ưu hóa hoạt động container như thế nào?**\n\n**Thử hỏi về:**\n• Chỉ số hiệu suất KPI\n• Mức tồn kho và trạng thái stock\n• Đề xuất chuyển kho và khuyến nghị\n• Cảnh báo và cảnh báo đang hoạt động\n• Gợi ý thông minh cho tối ưu hóa\n\n${suggestions.length ? "**Ưu tiên hiện tại:**\n" + suggestions.join("\n") : ""}\n\nGõ "trợ giúp" để xem danh sách lệnh đầy đủ hoặc "gợi ý" để nhận khuyến nghị thông minh.`
  };
}

// New server action for executing chatbot commands
export async function executeChatAction(action: string, actionData?: any) {
  try {
    switch (action) {
      case "approve_proposal":
        if (actionData?.id) {
          await approveProposal(actionData.id);
          return { success: true, message: `✅ Đề xuất ${actionData.id} đã được phê duyệt thành công!` };
        }
        break;
      
      case "reject_proposal":
        if (actionData?.id) {
          await rejectProposal(actionData.id);
          return { success: true, message: `❌ Đề xuất ${actionData.id} đã được từ chối thành công!` };
        }
        break;
      
      case "recompute_proposals":
        await recomputeProposals();
        const newProposals = await prisma.proposal.count({ where: { status: "draft" } });
        return { success: true, message: `🔄 Đã tính toán lại đề xuất! Tạo ra ${newProposals} khuyến nghị chuyển kho mới.` };
      
      case "resolve_alert":
        if (actionData?.id) {
          await prisma.alert.update({
            where: { id: actionData.id },
            data: { status: "resolved", resolvedAt: new Date() }
          });
          revalidatePath("/notifications");
          return { success: true, message: `✅ Cảnh báo ${actionData.id} đã được giải quyết thành công!` };
        }
        break;
      
      default:
        return { success: false, message: "Hành động không xác định được yêu cầu." };
    }
  } catch (error) {
    console.error("Chat action execution error:", error);
    return { success: false, message: "Thực hiện hành động thất bại. Vui lòng thử lại." };
  }
  
  return { success: false, message: "Tham số hành động không hợp lệ." };
}
