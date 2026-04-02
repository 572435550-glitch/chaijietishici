/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";
import { 
  Camera, 
  Clapperboard, 
  Copy, 
  Film, 
  Lightbulb, 
  Loader2, 
  Play, 
  Send, 
  Sparkles, 
  Video,
  CheckCircle2,
  ChevronRight,
  Info,
  History,
  Trash2,
  Plus,
  Menu,
  X,
  Clock,
  Upload,
  FileText,
  LogIn,
  LogOut,
  User
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { auth, db } from "./firebase";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from "firebase/auth";
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc,
  getDocFromServer
} from "firebase/firestore";

// Initialize Gemini API
const genAI = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `
# Role: 顶级AI视频分镜与提示词大师 (20年经验)

## Profile:
你是一位在人工智能与视觉生成领域深耕了20年的顶级大师。从早期的计算机视觉到如今sora、Runway Gen-2、Pika、Midjourney和Stable Diffusion，你对所有的AI图像与视频生成模型了如指掌。你精通电影摄影学、短视频爆款逻辑，以及所有视角、运镜、光影的AI提示词（Prompt）构建。你的核心能力是将任何一个故事、剧本或模糊的创意，完美拆解为专业级的视频分镜头，并为每一幕生成达到“完美”级别的英文/中文提示词。

## Core Competencies:
1. **极致的视频拆解能力**：能够将短视频剧本按秒级/幕级拆解，确保视觉连贯性、情绪递进和爆款节奏（如前3秒抓手）。
2. **全视角的镜头语言精通**：精准把控每一幕的景别（特写、中景、远景）、视角（第一人称POV、上帝视角、低角度仰拍等）和运镜（推、拉、摇、移、跟、航拍等）。
3. **完美的Prompt工程**：深谙各类AI视频工具的底层逻辑，能够按照“主体+动作+环境+光影+镜头语言+艺术风格+设备参数”的终极公式生成高质量Prompt。

## Knowledge Base (镜头语言专属词典):
- **景别 (Shot Sizes)**: Extreme Close-Up (ECU), Close-Up (CU), Medium Shot (MS), Wide Shot (WS), Establishing Shot.
- **视角 (Angles)**: Low Angle (仰拍), High Angle (俯拍), Eye-Level (平视), Bird's-Eye View (鸟瞰), Dutch Angle (倾斜镜头), Over the Shoulder (过肩镜头), POV (第一人称视角).
- **运镜 (Camera Movements)**: Pan (摇), Tilt (俯仰), Tracking/Follow (跟拍), Zoom In/Out (推拉), Drone Shot (无人机航拍), Handheld (手持感), Cinematic Glide (电影级滑轨).
- **光影与质感 (Lighting & Texture)**: Cinematic lighting, volumetric lighting (体积光), golden hour, neon noir, 8k resolution, photorealistic, shot on ARRI Alexa 65.

## Workflow (工作流):
当用户提供一个主题、剧本或一段现成的视频描述时，你必须严格按照以下四个步骤进行输出：

**第一步：剧本/创意整体分析 (Analysis)**
简述该视频的核心视觉基调、情绪氛围以及推荐的美术风格。

**第二步：分镜头结构拆解 (Storyboard Breakdown)**
将视频拆解为若干个具体的“幕（Scene）”，每一幕需要包含：镜头编号、画面时长、视觉描述、景别与运镜。

**第三步：完美提示词生成 (Prompt Generation)**
为每一幕生成可以直接复制到Runway/Pika/Sora等工具中使用的完美英文Prompt（因为目前AI视频工具对英文理解最准确），并附带中文释义。
**Prompt公式**：[Scene Subject] + [Specific Action] + [Setting/Environment] + [Lighting & Atmosphere] +[Camera Angle & Movement] + [Style/Quality Tags].

**第四步：大师级建议 (Pro Tips)**
针对该视频的生成，提供1-2个针对性的AI生成技巧（如参数调整建议、连贯性保持技巧、音乐节奏匹配等）。

请以Markdown格式输出，并确保结构清晰。
`;

interface HistoryItem {
  id: string;
  userId: string;
  title: string;
  input: string;
  result: string;
  timestamp: number;
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Test Connection
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Firebase connection error. Check configuration.");
        }
      }
    };
    testConnection();
  }, []);

  // Sync History with Firestore
  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, "history"),
      where("userId", "==", user.uid),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HistoryItem[];
      setHistory(items);
    }, (error) => {
      console.error("Firestore error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setResult(null);
      setInput("");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const model = "gemini-3.1-pro-preview";
      const response = await genAI.models.generateContent({
        model,
        contents: input,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
        },
      });

      const newResult = response.text || "未生成响应。";
      setResult(newResult);

      // Save to Firestore if logged in
      if (user) {
        await addDoc(collection(db, "history"), {
          userId: user.uid,
          title: input.slice(0, 20) + (input.length > 20 ? "..." : ""),
          input: input,
          result: newResult,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error("Generation error:", error);
      setResult("生成分镜时出错，请重试。");
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setInput(item.input);
    setResult(item.result);
    setShowHistory(false);
  };

  const deleteHistoryItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, "history", id));
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // File Handling
  const handleFile = useCallback((file: File) => {
    if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result;
        if (typeof text === "string") {
          setInput(text);
        }
      };
      reader.readAsText(file);
    } else {
      alert("仅支持 .txt 或 .md 文本文件");
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [result]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Sidebar Overlay */}
      <AnimatePresence>
        {showHistory && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60]"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-80 bg-white border-r border-slate-200 z-[70] shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <History className="w-5 h-5 text-blue-600" />
                  <span>云端历史记录</span>
                </div>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {!user ? (
                  <div className="text-center py-12 text-slate-400">
                    <LogIn className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm mb-4">登录后查看云端记录</p>
                    <button 
                      onClick={handleLogin}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold"
                    >
                      立即登录
                    </button>
                  </div>
                ) : history.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Clock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">暂无历史记录</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => loadFromHistory(item)}
                      className="group p-3 rounded-xl border border-transparent hover:border-blue-100 hover:bg-blue-50 transition-all cursor-pointer relative"
                    >
                      <div className="text-sm font-medium text-slate-700 truncate pr-8">
                        {item.title}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        {new Date(item.timestamp).toLocaleString()}
                      </div>
                      <button
                        onClick={(e) => deleteHistoryItem(e, item.id)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="p-4 border-t border-slate-100">
                <button
                  onClick={() => {
                    setInput("");
                    setResult(null);
                    setShowHistory(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>开始新创作</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowHistory(true)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors lg:hidden"
            >
              <Menu className="w-6 h-6 text-slate-600" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                <Clapperboard className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-black tracking-tight text-slate-900">
                AI 视频分镜大师
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowHistory(true)}
              className="hidden lg:flex items-center gap-2 px-4 py-2 hover:bg-slate-100 rounded-xl text-sm font-medium text-slate-600 transition-colors"
            >
              <History className="w-4 h-4" />
              <span>云端记录</span>
            </button>
            <div className="h-6 w-[1px] bg-slate-200 hidden sm:block"></div>
            
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-xs font-bold text-slate-700">{user.displayName}</span>
                  <button onClick={handleLogout} className="text-[10px] text-slate-400 hover:text-red-500 transition-colors">退出登录</button>
                </div>
                <img src={user.photoURL || ""} alt="Avatar" className="w-8 h-8 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
              >
                <User className="w-4 h-4" />
                <span>登录</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="mb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold mb-6 border border-blue-100">
              <Sparkles className="w-3 h-3" />
              <span>专业级 AI 视频提示词引擎</span>
            </div>
            <h2 className="text-4xl sm:text-6xl font-black mb-6 tracking-tight leading-tight text-slate-900">
              将创意剧本转化为 <br />
              <span className="text-blue-600">电影级视觉大片</span>
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto leading-relaxed">
              专业的分镜头拆解与完美的 AI 视频提示词。
              为 Sora、Runway、Pika 等主流模型深度优化。
            </p>
          </motion.div>
        </div>

        {/* Input Area with Drag & Drop */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`bg-white border-2 border-dashed rounded-3xl p-8 shadow-xl transition-all relative ${
            isDragging ? "border-blue-500 bg-blue-50/50 scale-[1.02]" : "border-slate-200 shadow-slate-200/50"
          } mb-16`}
        >
          {isDragging && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-50/80 backdrop-blur-sm rounded-3xl z-10">
              <Upload className="w-12 h-12 text-blue-600 mb-4 animate-bounce" />
              <p className="text-blue-600 font-bold text-xl">释放以导入剧本</p>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-slate-800">
              <Plus className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-bold uppercase tracking-wider">输入您的创意构思</span>
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-600 transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>导入文件</span>
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="hidden" 
              accept=".txt,.md"
            />
          </div>
          
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="描述您的视频主题、剧本，或者直接将 .txt/.md 文件拖入此处..."
            className="w-full h-56 bg-slate-50 border border-slate-200 rounded-2xl p-6 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all resize-none text-lg leading-relaxed"
          />
          
          <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4 text-slate-400 text-xs">
              <div className="flex items-center gap-1.5">
                <Info className="w-4 h-4" />
                <span>支持拖拽导入 / 云端同步</span>
              </div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={loading || !input.trim()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold px-10 py-4 rounded-2xl transition-all active:scale-95 shadow-xl shadow-blue-200"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>大师分析中...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>生成专业分镜</span>
                </>
              )}
            </button>
          </div>
        </motion.div>

        {/* Results Area */}
        <AnimatePresence>
          {result && (
            <motion.div
              ref={resultRef}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-10"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-50 rounded-2xl">
                    <Film className="w-7 h-7 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-900">大师级分镜脚本</h3>
                </div>
                <button
                  onClick={() => copyToClipboard(result, "full")}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                >
                  {copied === "full" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copied === "full" ? "已复制全文" : "复制全文"}
                </button>
              </div>

              <div className="prose prose-slate prose-blue max-w-none bg-white border border-slate-200 p-10 rounded-3xl shadow-lg shadow-slate-100 overflow-hidden">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="text-blue-600 border-b border-slate-100 pb-4 mb-8 font-black">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-slate-800 mt-12 mb-6 flex items-center gap-3 font-black"><ChevronRight className="w-6 h-6 text-blue-600" /> {children}</h2>,
                    h3: ({ children }) => <h3 className="text-slate-700 mt-8 mb-4 font-bold">{children}</h3>,
                    p: ({ children }) => <p className="text-slate-600 leading-loose mb-6 text-lg">{children}</p>,
                    ul: ({ children }) => <ul className="space-y-3 mb-8">{children}</ul>,
                    li: ({ children }) => <li className="text-slate-500 flex gap-3"><span className="text-blue-600 font-bold">•</span> <span className="leading-relaxed">{children}</span></li>,
                    code: ({ children }) => (
                      <div className="relative group my-8">
                        <div className="absolute -top-3 left-4 px-3 py-1 bg-blue-600 text-white text-[10px] font-black rounded-full uppercase tracking-widest z-10">
                          AI Prompt
                        </div>
                        <code className="block bg-slate-900 border border-slate-800 p-8 rounded-2xl text-blue-100 font-mono text-sm overflow-x-auto leading-relaxed shadow-2xl">
                          {children}
                        </code>
                        <button
                          onClick={() => copyToClipboard(String(children), String(children))}
                          className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-all backdrop-blur-md"
                        >
                          <Copy className="w-4 h-4 text-white" />
                        </button>
                      </div>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-8 border-blue-600 bg-blue-50 p-8 italic my-10 rounded-r-3xl text-slate-700 text-lg shadow-sm">
                        {children}
                      </blockquote>
                    )
                  }}
                >
                  {result}
                </ReactMarkdown>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white border border-slate-200 p-8 rounded-3xl hover:border-blue-200 transition-all group shadow-sm hover:shadow-xl hover:shadow-blue-100/50">
                  <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Camera className="w-6 h-6 text-blue-600" />
                  </div>
                  <h4 className="font-black text-slate-800 mb-3">电影级视角</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">深度优化的镜头语言与光影参数，确保视觉质感。</p>
                </div>
                <div className="bg-white border border-slate-200 p-8 rounded-3xl hover:border-blue-200 transition-all group shadow-sm hover:shadow-xl hover:shadow-blue-100/50">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Video className="w-6 h-6 text-indigo-600" />
                  </div>
                  <h4 className="font-black text-slate-800 mb-3">动态运镜</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">流畅的相机运动指令，提升短视频的节奏感与吸引力。</p>
                </div>
                <div className="bg-white border border-slate-200 p-8 rounded-3xl hover:border-blue-200 transition-all group shadow-sm hover:shadow-xl hover:shadow-blue-100/50">
                  <div className="w-12 h-12 bg-cyan-50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Lightbulb className="w-6 h-6 text-cyan-600" />
                  </div>
                  <h4 className="font-black text-slate-800 mb-3">大师建议</h4>
                  <p className="text-sm text-slate-400 leading-relaxed">针对不同模型的生成技巧，保持多场景视觉连贯性。</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State / Welcome */}
        {!result && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center mb-8 border border-slate-200 shadow-xl shadow-slate-200/50">
              <Play className="w-10 h-10 text-blue-600 fill-blue-600" />
            </div>
            <h3 className="text-2xl font-black mb-4 text-slate-800">准备好开启您的创作了吗？</h3>
            <p className="text-slate-400 max-w-md text-lg leading-relaxed">
              在上方输入您的剧本或拖入文件，让大师为您拆解专业分镜与提示词。
            </p>
            
            <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 opacity-40 grayscale hover:grayscale-0 transition-all duration-1000">
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                  <span className="text-[10px] font-black text-slate-900">SORA</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                  <span className="text-[10px] font-black text-slate-900">RUNWAY</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                  <span className="text-[10px] font-black text-slate-900">PIKA</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                  <span className="text-[10px] font-black text-slate-900">LUMA</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-20 mt-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3 opacity-60">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
              <Clapperboard className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-900">AI 视频分镜大师 © 2026</span>
          </div>
          <div className="flex gap-10 text-sm font-bold text-slate-400">
            <a href="#" className="hover:text-blue-600 transition-colors">使用文档</a>
            <a href="#" className="hover:text-blue-600 transition-colors">API 密钥</a>
            <a href="#" className="hover:text-blue-600 transition-colors">技术支持</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
