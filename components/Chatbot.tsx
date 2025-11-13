"use client";
import { useState, useCallback, memo } from "react";
import { executeChatAction } from "@/app/action";

type Message = {
  role: "user" | "assistant";
  text: string;
  isAction?: boolean;
};

const INITIAL_MESSAGE: Message = {
  role: "assistant",
  text: "🤖 **Trợ lý Container AI sẵn sàng!**\n\nTôi có thể hỗ trợ bạn:\n• Đề xuất thông minh sau khi import báo cáo\n• Thực hiện hành động trực tiếp (phê duyệt đề xuất, giải quyết cảnh báo)\n• Phân tích KPI, tồn kho và dữ liệu vận hành\n• Đưa ra khuyến nghị dựa trên ngữ cảnh\n\nGõ 'trợ giúp' để xem lệnh hoặc 'gợi ý' để nhận thông tin thông minh!"
};

function Chatbot() {
  const [msgs, setMsgs] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const send = useCallback(async () => {
    if (!input.trim() || isProcessing) return;
    
    const userMessage = input;
    const user = { role: "user" as const, text: userMessage };
    setMsgs(m => [...m, user]);
    setInput("");
    setIsProcessing(true);

    try {
      // Use API route instead of server action
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage })
      });
      
      if (!response.ok) {
        throw new Error('Chat request failed');
      }
      
      const data = await response.json();
      
      // Check if this is an action that needs to be executed
      if (data.action) {
        // Show the initial response
        setMsgs(m => [...m, { role: "assistant", text: data.message, isAction: true }]);
        
        // Execute the action using server action
        const actionResult = await executeChatAction(data.action, data.actionData);
        
        // Show the action result
        setMsgs(m => [...m, { 
          role: "assistant", 
          text: actionResult.message + (actionResult.success ? "\n\n💡 **Mẹo:** Các thay đổi đã được cập nhật trong hệ thống. Kiểm tra các trang liên quan để xem dữ liệu mới." : ""),
          isAction: false 
        }]);
      } else {
        // Regular informational response
        setMsgs(m => [...m, { role: "assistant", text: data.message }]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMsgs(m => [...m, { 
        role: "assistant", 
        text: "❌ Xin lỗi, tôi gặp lỗi khi xử lý yêu cầu của bạn. Vui lòng thử lại." 
      }]);
    }

    setIsProcessing(false);
  }, [input, isProcessing]);

  const handleSuggest = useCallback(() => setInput("gợi ý"), []);
  const handleHelp = useCallback(() => setInput("trợ giúp"), []);
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  }, []);
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      send();
    }
  }, [send]);

  return (
    <div className="w-80 border-l border-neutral-800 flex flex-col">
      <div className="p-3 border-b border-neutral-800">
        <div className="font-semibold">🤖 AI Assistant</div>
        <div className="text-xs text-neutral-400 mt-1">Gợi ý thông minh & thực hiện hành động</div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={`${m.role === "user" ? "text-right" : ""}`}>
            <div className={`inline-block max-w-[90%] px-3 py-2 rounded-lg text-sm ${
              m.role === "user" 
                ? "bg-blue-600 text-white" 
                : m.isAction 
                  ? "bg-orange-900/30 border border-orange-700/50 text-orange-200"
                  : "bg-neutral-800 text-neutral-200"
            }`}>
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-neutral-800 px-3 py-2 rounded-lg text-sm text-neutral-400">
              <div className="flex items-center gap-2">
                <div className="animate-spin w-4 h-4 border-2 border-neutral-600 border-t-neutral-400 rounded-full"></div>
                Đang xử lý...
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-neutral-800">
        <div className="flex gap-2 mb-2">
          <button
            onClick={handleSuggest}
            className="px-2 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
          >
            💡 Gợi ý
          </button>
          <button
            onClick={handleHelp}
            className="px-2 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
          >
            📖 Trợ giúp
          </button>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-sm placeholder-neutral-500"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Hỏi về KPI, tồn kho, đề xuất..."
            disabled={isProcessing}
          />
          <button
            onClick={send}
            disabled={isProcessing || !input.trim()}
            className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 disabled:bg-neutral-700 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isProcessing ? "..." : "Gửi"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Wrap component in React.memo to prevent unnecessary re-renders
export default memo(Chatbot);
