import { NextRequest, NextResponse } from 'next/server';
import { getSafety } from '@/lib/safetyStock';

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    
    // Check if we're in build time (no DATABASE_URL available)
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('file:')) {
      return NextResponse.json({
        message: "🤖 AI Assistant hiện chưa sẵn sàng. Vui lòng thử lại sau khi database được kết nối."
      });
    }

    // Dynamic import to avoid build-time issues
    const { prisma } = await import('@/lib/db');
    
    const [kpi, inv, props, alerts, bookings] = await Promise.all([
      prisma.kPI.findFirst(),
      prisma.inventory.findMany(),
      prisma.proposal.findMany(),
      prisma.alert.findMany({ where: { status: "active" }, orderBy: { createdAt: "desc" } }),
      prisma.booking.findMany({ take: 10, orderBy: { date: "desc" } })
    ]);

    const q = query.toLowerCase().trim();

    // Action Detection - Check if user wants to execute an action
    if (q.includes("approve") || q.includes("phê duyệt") || q.includes("duyệt")) {
      const proposalMatch = query.match(/P\d{4}/i);
      if (proposalMatch) {
        return NextResponse.json({
          message: `Đang thực hiện phê duyệt đề xuất ${proposalMatch[0]}...`,
          action: "approve_proposal",
          actionData: { id: proposalMatch[0] }
        });
      }
      const pendingProps = props.filter(p => p.status === "draft");
      if (pendingProps.length > 0) {
        return NextResponse.json({
          message: `Tìm thấy ${pendingProps.length} đề xuất chờ phê duyệt:\n${pendingProps.slice(0,3).map(p => `- ${p.id}: ${p.route} (${p.qty} TEU ${p.size})`).join("\n")}\n\nGõ "phê duyệt P0001" để phê duyệt đề xuất cụ thể.`
        });
      }
    }

    if (q.includes("reject") || q.includes("từ chối")) {
      const proposalMatch = query.match(/P\d{4}/i);
      if (proposalMatch) {
        return NextResponse.json({
          message: `Đang thực hiện từ chối đề xuất ${proposalMatch[0]}...`,
          action: "reject_proposal",
          actionData: { id: proposalMatch[0] }
        });
      }
    }

    if (q.includes("recompute") || q.includes("tính lại") || q.includes("cập nhật")) {
      return NextResponse.json({
        message: "Đang tính toán lại đề xuất dựa trên tồn kho và nhu cầu hiện tại...",
        action: "recompute_proposals"
      });
    }

    if (q.includes("resolve alert") || q.includes("giải quyết cảnh báo")) {
      const alertMatch = query.match(/A\d{4}/i);
      if (alertMatch) {
        return NextResponse.json({
          message: `Đang giải quyết cảnh báo ${alertMatch[0]}...`,
          action: "resolve_alert",
          actionData: { id: alertMatch[0] }
        });
      }
    }

    // Information Queries
    if (/kpi|hiệu suất|performance/i.test(q)) {
      const suggestions = [];
      if (kpi) {
        const approvalRate = parseInt(kpi.approvalRate.replace('%', ''));
        if (approvalRate < 80) suggestions.push("💡 Nên xem xét lại tiêu chí đề xuất để cải thiện tỷ lệ phê duyệt");
        if (kpi.dwellTime.includes("3.")) suggestions.push("💡 Thời gian lưu trữ có thể tối ưu hóa - xem xét hiệu quả di chuyển container");
      }
      
      return NextResponse.json({
        message: `📊 **Tình trạng KPI hiện tại:**\n• Tỷ lệ sử dụng: ${kpi?.utilization || "Không có"}\n• Chi phí lưu trữ: ${kpi?.storageCost || "Không có"}\n• Thời gian lưu trữ: ${kpi?.dwellTime || "Không có"}\n• Tỷ lệ phê duyệt: ${kpi?.approvalRate || "Không có"}\n\n${suggestions.length ? "**Gợi ý:**\n" + suggestions.join("\n") : ""}`
      });
    }

    if (/inventory|tồn kho|stock/i.test(q)) {
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
      
      return NextResponse.json({
        message: `📦 **Tổng quan tồn kho:**\n${topStock}\n\n${suggestions.length ? "**Gợi ý:**\n" + suggestions.join("\n") : ""}${lowStock.length > 0 ? "\n\n**Hành động khẩn cấp:** Gõ 'tính lại' để tạo đề xuất chuyển kho mới" : ""}`
      });
    }

    // ML Suggestions Support in Chat API
    if (/suggest|gợi ý|recommend|khuyến nghị/i.test(q)) {
      try {
        const { askChat } = await import('@/app/action');
        const result = await askChat(query);
        return NextResponse.json({
          message: result.message,
          mlSuggestions: result.mlSuggestions,
          sessionId: result.sessionId
        });
      } catch (error) {
        console.error('ML suggestions in chat API failed:', error);
        return NextResponse.json({
          message: "💡 **Hệ thống ML đang khởi tạo...**\n\nUpload file Excel để cải thiện chất lượng gợi ý."
        });
      }
    }

    if (/help|trợ giúp|hướng dẫn/i.test(q)) {
      return NextResponse.json({
        message: `🤖 **Các lệnh và khả năng của Chatbot:**\n\n**Truy vấn thông tin:**\n• "KPI" - Xem chỉ số hiệu suất\n• "tồn kho" - Kiểm tra mức tồn\n• "đề xuất" - Xem xét kế hoạch chuyển kho\n• "cảnh báo" - Xem cảnh báo đang hoạt động\n• "gợi ý" - Nhận khuyến nghị ML thông minh\n\n**Lệnh hành động:**\n• "phê duyệt P0001" - Phê duyệt đề xuất cụ thể\n• "từ chối P0002" - Từ chối đề xuất\n• "tính lại" - Tính toán lại tất cả đề xuất\n• "giải quyết cảnh báo A0001" - Đóng cảnh báo\n\n**🤖 ML Features:**\n• Gợi ý học từ dữ liệu Excel của bạn\n• Cải thiện theo thời gian từ feedback\n• Phân tích patterns và trends tự động`
      });
    }

    // Default response
    const suggestions = [];
    const criticalIssues = alerts.filter(a => a.level === "Cao").length;
    const pendingActions = props.filter(p => p.status === "draft").length;
    
    if (criticalIssues > 0) suggestions.push(`🚨 ${criticalIssues} cảnh báo quan trọng cần chú ý`);
    if (pendingActions > 0) suggestions.push(`📋 ${pendingActions} đề xuất chờ phê duyệt`);
    
    return NextResponse.json({
      message: `🤖 **Tôi có thể giúp bạn với:**\n\n• "KPI" - Xem hiệu suất\n• "tồn kho" - Kiểm tra stock\n• "đề xuất" - Xem proposals\n• "gợi ý" - Nhận khuyến nghị\n\n${suggestions.length ? "**Ưu tiên hiện tại:**\n" + suggestions.join("\n") : ""}\n\nGõ "trợ giúp" để xem đầy đủ các lệnh.`
    });
    
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({
      message: "❌ Xin lỗi, tôi gặp lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại."
    }, { status: 500 });
  }
}