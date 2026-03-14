import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import { 
  Upload, 
  FileVideo, 
  ShieldCheck, 
  ShieldAlert, 
  Activity, 
  Eye, 
  Clock, 
  Network, 
  CheckCircle2, 
  RefreshCw,
  AlertCircle,
  Download,
  Loader2,
  FileJson,
  FileText,
  History,
  X,
  ChevronDown,
  Fingerprint,
  Scan,
  AudioWaveform,
  HeartPulse
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { set, get } from 'idb-keyval';
import { cn } from './lib/utils';
import { analyzeVideo, AnalysisResult } from './lib/gemini';

type AnalysisState = 'idle' | 'analyzing' | 'results';

interface HistoryItem extends AnalysisResult {
  id: string;
  fileName: string;
  date: string;
}

const agentsList = [
  {
    id: 'spatial',
    name: 'Spatial Anomalies Agent',
    type: 'CNN / ViT',
    description: 'Detects blending boundaries, mismatched lighting, unnatural skin textures, missing reflections, and asymmetrical facial features.',
    status: 'online',
    icon: Eye,
    color: 'emerald'
  },
  {
    id: 'temporal',
    name: 'Temporal Behavior Agent',
    type: 'GRU Sequence',
    description: 'Analyzes frame-to-frame flickering, unnatural blinking, micro-expression inconsistencies, and lip-sync desynchronization.',
    status: 'online',
    icon: Clock,
    color: 'amber'
  },
  {
    id: 'biological',
    name: 'Biological Signal Agent',
    type: 'rPPG Extraction',
    description: 'Extracts and analyzes micro-color changes in the skin (pulse) to detect unnatural vital signs.',
    status: 'online',
    icon: HeartPulse,
    color: 'indigo'
  },
  {
    id: 'provenance',
    name: 'Provenance & Lineage Agent',
    type: 'Metadata Analyzer',
    description: 'Inspects metadata inconsistencies, missing EXIF data, compression matrices, and traces of generative AI software.',
    status: 'online',
    icon: FileText,
    color: 'blue'
  },
  {
    id: 'fingerprint',
    name: 'Model Fingerprint Agent',
    type: 'Spectral Analyzer',
    description: 'Identifies the generative signature (e.g., GAN, Diffusion) based on visual artifact structures and frequency-domain patterns.',
    status: 'online',
    icon: Fingerprint,
    color: 'purple'
  },
  {
    id: 'voice',
    name: 'Voice Clone Agent',
    type: 'Audio Spectrogram',
    description: 'Analyzes audio for unnatural pitch, mel spectrogram artifacts, repeated waveform patterns, and lack of natural breath noise.',
    status: 'online',
    icon: AudioWaveform,
    color: 'rose'
  }
];

export default function App() {
  const [appState, setAppState] = useState<AnalysisState>('idle');
  const [progress, setProgress] = useState(0);
  const [activeAgent, setActiveAgent] = useState('Initializing...');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customApiKey, setCustomApiKey] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<'spatial' | 'temporal' | 'biological' | null>(null);
  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Agents' | 'Forensics' | 'Settings'>('Dashboard');
  const [enabledAgents, setEnabledAgents] = useState<Record<string, boolean>>({
    spatial: true,
    temporal: true,
    biological: true,
    provenance: true,
    fingerprint: true,
    voice: true
  });

  const toggleAgent = (id: string) => {
    setEnabledAgents(prev => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    const savedHistory = localStorage.getItem('deepTraceHistory');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > 200 * 1024 * 1024) {
        setError("File is too large. Please upload a video under 200MB.");
        return;
      }
      startAnalysis(file);
    }
  };

  const startAnalysis = async (file: File) => {
    setAppState('analyzing');
    setProgress(0);
    setError(null);
    setFileName(file.name);
    
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setVideoUrl(URL.createObjectURL(file));
    
    let currentProgress = 0;
    const progressInterval = setInterval(() => {
      currentProgress += (90 - currentProgress) * 0.05;
      setProgress(Math.round(currentProgress));
    }, 200);

    try {
      const res = await analyzeVideo(file, customApiKey);
      clearInterval(progressInterval);
      setProgress(100);
      setResult(res as AnalysisResult);
      
      const newHistoryItem: HistoryItem = {
        id: Date.now().toString(),
        fileName: file.name,
        date: new Date().toISOString(),
        ...(res as AnalysisResult)
      };
      
      // Save video to IndexedDB
      try {
        await set(`video_${newHistoryItem.id}`, file);
      } catch (e) {
        console.error("Failed to save video to IndexedDB", e);
      }

      setHistory(prev => {
        const newHistory = [newHistoryItem, ...prev].slice(0, 50);
        localStorage.setItem('deepTraceHistory', JSON.stringify(newHistory));
        return newHistory;
      });

      setTimeout(() => setAppState('results'), 600);
    } catch (err: any) {
      clearInterval(progressInterval);
      console.error(err);
      
      let errorMessage = err.message || "An error occurred during analysis.";
      if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("quota")) {
        errorMessage = "API quota exceeded. Please check your Gemini API billing details, or try again later. Uploading a shorter video may also help reduce token usage.";
      } else if (errorMessage.includes("API key not valid") || errorMessage.includes("API_KEY_INVALID") || errorMessage.includes("400") || errorMessage.includes("403")) {
        errorMessage = "Invalid Gemini API key. Please check your custom key and try again.";
      }
      
      setError(errorMessage);
      setAppState('idle');
    }
  };

  useEffect(() => {
    if (appState === 'analyzing') {
      const agents = [
        'Spatial Analysis Agent (CNN/ViT)',
        'Temporal Behavior Agent (GRU)',
        'Biological Signal Agent (rPPG)',
        'Provenance & Lineage Agent',
        'Central Reasoning Agent'
      ];
      let i = 0;
      setActiveAgent(agents[0]);
      const interval = setInterval(() => {
        i = (i + 1) % agents.length;
        setActiveAgent(agents[i]);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [appState]);

  const resetApp = () => {
    setAppState('idle');
    setProgress(0);
    setResult(null);
    setError(null);
    setFileName('');
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
  };

  const formatChartData = (data: number[] | undefined, key: string) => {
    if (!data || !Array.isArray(data)) return [];
    return data.map((val, i) => ({ time: i, [key]: val }));
  };

  const exportJSON = () => {
    if (!result) return;
    const reportData = {
      fileName,
      analysisDate: new Date().toISOString(),
      ...result
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DeepTrace_Report_${fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const exportPDF = async () => {
    if (!result) return;
    setShowExportMenu(false);
    
    // Wait for the dropdown to close
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const element = document.getElementById('report-content');
    if (!element) return;
    
    try {
      // Force desktop width for a comprehensive report layout
      const targetWidth = 1200;
      const targetHeight = element.scrollHeight + 64; // Account for padding
      
      const dataUrl = await toPng(element, { 
        quality: 1.0, 
        backgroundColor: '#f8fafc', 
        pixelRatio: 2,
        width: targetWidth,
        height: targetHeight,
        style: {
          width: `${targetWidth}px`,
          height: `${targetHeight}px`,
          margin: '0',
          padding: '32px'
        }
      });
      
      const img = new Image();
      img.src = dataUrl;
      img.onload = () => {
        // Create a continuous single-page PDF matching the exact image dimensions
        // This prevents any awkward page breaks that slice through text or charts
        const pdf = new jsPDF({
          orientation: img.width > img.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [img.width, img.height]
        });
        
        pdf.addImage(dataUrl, 'PNG', 0, 0, img.width, img.height);
        pdf.save(`DeepTrace_Report_${fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
      };
    } catch (err) {
      console.error("Failed to generate PDF", err);
      alert("Failed to generate PDF report.");
    }
  };

  const loadHistoryItem = async (item: HistoryItem) => {
    setFileName(item.fileName);
    setResult(item);
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
    
    try {
      const savedFile = await get(`video_${item.id}`);
      if (savedFile) {
        setVideoUrl(URL.createObjectURL(savedFile as File));
      }
    } catch (e) {
      console.error("Failed to load video from IndexedDB", e);
    }

    setAppState('results');
    setShowHistory(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/50 via-white to-teal-50/30 text-slate-800 font-sans selection:bg-emerald-200">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-emerald-100/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={resetApp}>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-400 to-teal-300 flex items-center justify-center shadow-sm shadow-emerald-200">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold tracking-tight text-slate-900">DeepTrace</span>
          </div>
          <nav className="hidden sm:flex items-center gap-6 text-sm font-medium text-slate-500">
            <button onClick={() => setShowHistory(true)} className="flex items-center gap-2 hover:text-emerald-600 transition-colors">
              <History className="w-4 h-4" /> History
            </button>
            <button onClick={() => setActiveTab('Dashboard')} className={cn("hover:text-emerald-600 transition-colors", activeTab === 'Dashboard' && "text-emerald-600 font-semibold")}>Dashboard</button>
            <button onClick={() => setActiveTab('Agents')} className={cn("hover:text-emerald-600 transition-colors", activeTab === 'Agents' && "text-emerald-600 font-semibold")}>Agents</button>
            <button onClick={() => setActiveTab('Forensics')} className={cn("hover:text-emerald-600 transition-colors", activeTab === 'Forensics' && "text-emerald-600 font-semibold")}>Forensics</button>
            <button onClick={() => setActiveTab('Settings')} className={cn("hover:text-emerald-600 transition-colors", activeTab === 'Settings' && "text-emerald-600 font-semibold")}>Settings</button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {activeTab === 'Agents' && (
            <motion.div
              key="agents"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-8"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Agents Activity Status</h1>
                  <p className="text-slate-500 mt-2">Real-time monitoring of DeepTrace forensic agents.</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-sm font-medium border border-emerald-100">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  All Systems Operational
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {agentsList.map((agent) => {
                  const Icon = agent.icon;
                  const isEnabled = enabledAgents[agent.id];
                  return (
                    <div key={agent.id} className={cn("bg-white rounded-3xl p-6 shadow-sm border transition-all", isEnabled ? "border-slate-200 hover:shadow-md" : "border-slate-100 opacity-75")}>
                      <div className="flex items-start justify-between mb-4">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
                          !isEnabled ? "bg-slate-100 text-slate-400" :
                          agent.color === 'emerald' ? "bg-emerald-100 text-emerald-600" :
                          agent.color === 'amber' ? "bg-amber-100 text-amber-600" :
                          agent.color === 'indigo' ? "bg-indigo-100 text-indigo-600" :
                          agent.color === 'blue' ? "bg-blue-100 text-blue-600" :
                          agent.color === 'purple' ? "bg-purple-100 text-purple-600" :
                          "bg-rose-100 text-rose-600"
                        )}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors", isEnabled ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-slate-50 border-slate-200 text-slate-500")}>
                          <div className={cn("w-1.5 h-1.5 rounded-full", isEnabled ? "bg-emerald-500" : "bg-slate-400")} />
                          {isEnabled ? 'Online' : 'Offline'}
                        </div>
                      </div>
                      <h3 className={cn("text-lg font-semibold mb-1", isEnabled ? "text-slate-800" : "text-slate-500")}>{agent.name}</h3>
                      <p className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wider">{agent.type}</p>
                      <p className={cn("text-sm leading-relaxed", isEnabled ? "text-slate-600" : "text-slate-400")}>
                        {agent.description}
                      </p>
                      <button
                        onClick={() => toggleAgent(agent.id)}
                        className={cn(
                          "mt-5 w-full py-2.5 rounded-xl text-sm font-medium transition-colors border",
                          isEnabled 
                            ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-50" 
                            : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                        )}
                      >
                        {isEnabled ? 'Disable Agent' : 'Enable Agent'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === 'Forensics' && (
            <motion.div
              key="forensics"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-8"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Forensic Evidence Panel</h1>
                  <p className="text-slate-500 mt-2">Detailed breakdown of anomalies detected by individual agents.</p>
                </div>
              </div>

              {!result ? (
                <div className="flex flex-col items-center justify-center p-12 bg-slate-50 rounded-3xl border border-slate-200 border-dashed min-h-[400px]">
                  <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4">
                    <Scan className="w-8 h-8 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-900 mb-2">No Evidence Available</h3>
                  <p className="text-slate-500 text-center max-w-md">
                    Upload and analyze a video in the Dashboard to generate forensic evidence.
                  </p>
                  <button 
                    onClick={() => setActiveTab('Dashboard')}
                    className="mt-6 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
                  >
                    Go to Dashboard
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Spatial Evidence */}
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                        <Eye className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">Spatial Anomalies</h3>
                        <p className="text-xs text-slate-500">Confidence: {result.spatial.score}%</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {result.spatial.reasoning}
                    </p>
                    <div className="space-y-2">
                      {result.spatial.details.keyMetrics.map((metric, i) => (
                        <div key={i} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-slate-50">
                          <span className="text-slate-600">{metric.name}</span>
                          <span className={cn(
                            "font-medium px-2 py-0.5 rounded-md text-xs",
                            metric.status === 'Pass' ? "bg-emerald-100 text-emerald-700" :
                            metric.status === 'Fail' ? "bg-rose-100 text-rose-700" :
                            "bg-amber-100 text-amber-700"
                          )}>
                            {metric.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Temporal Evidence */}
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">Temporal Behavior</h3>
                        <p className="text-xs text-slate-500">Confidence: {result.temporal.score}%</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {result.temporal.reasoning}
                    </p>
                    <div className="space-y-2">
                      {result.temporal.details.keyMetrics.map((metric, i) => (
                        <div key={i} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-slate-50">
                          <span className="text-slate-600">{metric.name}</span>
                          <span className={cn(
                            "font-medium px-2 py-0.5 rounded-md text-xs",
                            metric.status === 'Pass' ? "bg-emerald-100 text-emerald-700" :
                            metric.status === 'Fail' ? "bg-rose-100 text-rose-700" :
                            "bg-amber-100 text-amber-700"
                          )}>
                            {metric.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Biological Evidence */}
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                        <HeartPulse className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">Biological Signal</h3>
                        <p className="text-xs text-slate-500">Confidence: {result.biological.score}%</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {result.biological.reasoning}
                    </p>
                    <div className="space-y-2">
                      {result.biological.details.keyMetrics.map((metric, i) => (
                        <div key={i} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-slate-50">
                          <span className="text-slate-600">{metric.name}</span>
                          <span className={cn(
                            "font-medium px-2 py-0.5 rounded-md text-xs",
                            metric.status === 'Pass' ? "bg-emerald-100 text-emerald-700" :
                            metric.status === 'Fail' ? "bg-rose-100 text-rose-700" :
                            "bg-amber-100 text-amber-700"
                          )}>
                            {metric.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Voice Clone Evidence */}
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                        <AudioWaveform className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">Voice Clone Analysis</h3>
                        <p className="text-xs text-slate-500">Confidence: {result.voice.score}%</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {result.voice.reasoning}
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-slate-50">
                        <span className="text-slate-600">Synthetic Harmonics</span>
                        <span className={cn(
                          "font-medium px-2 py-0.5 rounded-md text-xs",
                          !result.voice.indicators.syntheticHarmonics ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                        )}>
                          {result.voice.indicators.syntheticHarmonics ? 'Detected' : 'Clear'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-slate-50">
                        <span className="text-slate-600">Natural Breath Noise</span>
                        <span className={cn(
                          "font-medium px-2 py-0.5 rounded-md text-xs",
                          result.voice.indicators.naturalBreathNoise ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                        )}>
                          {result.voice.indicators.naturalBreathNoise ? 'Present' : 'Missing'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-slate-50">
                        <span className="text-slate-600">Uniform Pitch Curve</span>
                        <span className={cn(
                          "font-medium px-2 py-0.5 rounded-md text-xs",
                          !result.voice.indicators.uniformPitchCurve ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                        )}>
                          {result.voice.indicators.uniformPitchCurve ? 'Unnatural' : 'Natural'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Provenance Evidence */}
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">Provenance & Lineage</h3>
                        <p className="text-xs text-slate-500">Confidence: {result.provenance.score}%</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {result.provenance.reasoning}
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-slate-50">
                        <span className="text-slate-600">Capture Device</span>
                        <span className="font-medium text-slate-800">{result.provenance.captureDevice}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-slate-50">
                        <span className="text-slate-600">Software Encoding</span>
                        <span className="font-medium text-slate-800">{result.provenance.softwareEncoding}</span>
                      </div>
                      {result.provenance.metadataAnomalies.length > 0 && (
                        <div className="pt-2">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Metadata Anomalies</span>
                          <div className="flex flex-wrap gap-1">
                            {result.provenance.metadataAnomalies.map((anomaly, i) => (
                              <span key={i} className="px-2 py-1 bg-rose-50 text-rose-600 rounded text-xs border border-rose-100">
                                {anomaly}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Fingerprint Evidence */}
                  <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                        <Fingerprint className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">Model Fingerprint</h3>
                        <p className="text-xs text-slate-500">Confidence: {result.modelAttribution.confidence}%</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {result.modelAttribution.reasoning}
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-slate-50">
                        <span className="text-slate-600">Detected Architecture</span>
                        <span className="font-medium text-slate-800">{result.modelAttribution.detectedArchitecture}</span>
                      </div>
                      {result.modelAttribution.possibleSources.length > 0 && (
                        <div className="pt-2">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Possible Sources</span>
                          <div className="flex flex-wrap gap-1">
                            {result.modelAttribution.possibleSources.map((source, i) => (
                              <span key={i} className="px-2 py-1 bg-purple-50 text-purple-600 rounded text-xs border border-purple-100">
                                {source}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'Dashboard' && appState === 'idle' && (
            <motion.div 
              key="idle"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center justify-center min-h-[60vh]"
            >
              <div className="text-center max-w-2xl mb-12">
                <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900 mb-6">
                  Agentic AI Deepfake Trust Analysis
                </h1>
                <p className="text-lg text-slate-500 leading-relaxed">
                  Upload media to initiate a multi-agent forensic analysis. DeepTrace combines spatial CNNs, temporal GRUs, and biological rPPG signals to determine authenticity.
                </p>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 max-w-xl w-full">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              <div className="w-full max-w-xl mb-6">
                <div className="bg-white/60 backdrop-blur-md border border-emerald-100 rounded-2xl p-4 shadow-sm text-left">
                  <label htmlFor="api-key" className="block text-sm font-medium text-slate-700 mb-1">
                    Custom Gemini API Key (Optional)
                  </label>
                  <p className="text-xs text-slate-500 mb-3">
                    Provide your own API key to bypass default rate limits.
                  </p>
                  <input
                    id="api-key"
                    type="password"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 bg-white"
                  />
                </div>
              </div>

              <div className="w-full max-w-xl relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-200 to-teal-200 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
                <label className="relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-emerald-200 rounded-3xl bg-white/50 backdrop-blur-sm hover:bg-emerald-50/50 transition-all cursor-pointer overflow-hidden">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <div className="w-16 h-16 mb-4 rounded-full bg-emerald-100/50 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform duration-300">
                      <Upload className="w-8 h-8" />
                    </div>
                    <p className="mb-2 text-lg font-medium text-slate-700">Click to upload video</p>
                    <p className="text-sm text-slate-400">MP4, MOV, AVI (Max 200MB)</p>
                  </div>
                  <input type="file" className="hidden" accept="video/*" onChange={handleUpload} />
                </label>
              </div>
            </motion.div>
          )}

          {activeTab === 'Dashboard' && appState === 'analyzing' && (
            <motion.div 
              key="analyzing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto w-full"
            >
              <div className="w-24 h-24 relative mb-8">
                <div className="absolute inset-0 rounded-full border-4 border-emerald-100"></div>
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="48"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeDasharray="301.59"
                    strokeDashoffset={301.59 - (progress / 100) * 301.59}
                    className="text-emerald-400 transition-all duration-300 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Loader2 className="w-6 h-6 text-emerald-500 animate-spin mb-1" />
                  <span className="text-sm font-semibold text-emerald-600">{progress}%</span>
                </div>
              </div>

              <h2 className="text-2xl font-medium text-slate-800 mb-2">Multi-Agent Analysis in Progress</h2>
              <p className="text-slate-500 mb-8 h-6 text-center">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={activeAgent}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="inline-block"
                  >
                    Active: {activeAgent}...
                  </motion.span>
                </AnimatePresence>
              </p>

              <div className="w-full space-y-3">
                {['Spatial Analysis', 'Temporal Analysis', 'Biological Signals', 'Provenance Check'].map((step, i) => {
                  const stepProgress = Math.min(100, Math.max(0, (progress - i * 25) * 4));
                  return (
                    <div key={step} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-4">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors duration-500",
                        stepProgress === 100 ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"
                      )}>
                        {stepProgress === 100 ? <CheckCircle2 className="w-5 h-5" /> : <div className="w-2 h-2 rounded-full bg-current animate-pulse" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="text-sm font-medium text-slate-700">{step}</span>
                          <span className="text-xs text-slate-400">{Math.round(stepProgress)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-400 transition-all duration-300 ease-out"
                            style={{ width: `${stepProgress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === 'Dashboard' && appState === 'results' && result && (
            <motion.div 
              key="results"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div id="report-content" className="space-y-8">
                {/* Top Summary Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Trust Score Card */}
                <div className="lg:col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-slate-100 relative">
                  <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
                    <div className={cn(
                      "absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/3",
                      result.isAuthentic ? "bg-emerald-400" : "bg-rose-400"
                    )} />
                  </div>
                  
                  <div className="flex flex-col md:flex-row items-start md:items-center gap-8 relative z-10">
                    <div className="shrink-0">
                      <div className="relative w-40 h-40">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                          <circle
                            cx="50"
                            cy="50"
                            r="45"
                            fill="none"
                            stroke={result.isAuthentic ? "#34d399" : "#fb7185"}
                            strokeWidth="8"
                            strokeDasharray="282.7"
                            strokeDashoffset={282.7 - (result.trustScore / 100) * 282.7}
                            strokeLinecap="round"
                            className="transition-all duration-1000 ease-out"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className={cn(
                            "text-4xl font-semibold tracking-tighter",
                            result.isAuthentic ? "text-emerald-500" : "text-rose-500"
                          )}>
                            {result.trustScore}%
                          </span>
                          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-1">Trust Level</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        {result.isAuthentic ? (
                          <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full text-sm font-medium">
                            <ShieldCheck className="w-4 h-4" />
                            Authentic Media
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-rose-600 bg-rose-50 px-3 py-1 rounded-full text-sm font-medium">
                            <ShieldAlert className="w-4 h-4" />
                            Manipulated Media
                          </div>
                        )}
                        <span className="text-sm text-slate-400 flex items-center gap-1">
                          <FileVideo className="w-4 h-4" /> {fileName}
                        </span>
                      </div>
                      
                      <h2 className="text-2xl font-semibold text-slate-800 mb-4">
                        Central Reasoning Agent Conclusion
                      </h2>
                      <p className="text-slate-600 leading-relaxed">
                        {result.conclusion}
                      </p>
                      
                      <div className="mt-6 flex gap-3">
                        <button onClick={resetApp} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors">
                          <RefreshCw className="w-4 h-4" /> Analyze Another
                        </button>
                        <div className="relative">
                          <button 
                            onClick={() => setShowExportMenu(!showExportMenu)} 
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                          >
                            <Download className="w-4 h-4" /> Export Report <ChevronDown className="w-4 h-4" />
                          </button>
                          
                          {showExportMenu && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-2 z-50">
                              <button onClick={exportPDF} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                <FileText className="w-4 h-4" /> Export as PDF
                              </button>
                              <button onClick={exportJSON} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                <FileJson className="w-4 h-4" /> Export as JSON
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Provenance Card */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center">
                        <Network className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">Provenance & Lineage</h3>
                        <p className="text-xs text-slate-500">Metadata Analysis Agent</p>
                      </div>
                    </div>
                    <span className={cn(
                      "text-xs font-semibold px-2.5 py-1 rounded-full",
                      result.provenance.score > 70 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                    )}>
                      {result.provenance.score > 70 ? 'Pass' : 'Fail'}
                    </span>
                  </div>
                  
                  <div className="flex-1 flex flex-col justify-center space-y-4 relative mb-4">
                    <div className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-slate-100"></div>
                    
                    <div className="flex items-start gap-4 relative z-10">
                      <div className="w-6 h-6 rounded-full bg-emerald-100 border-2 border-white flex items-center justify-center shrink-0 mt-0.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">Capture Device</p>
                        <p className="text-xs text-slate-500">{result.provenance.captureDevice}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-4 relative z-10">
                      <div className={cn(
                        "w-6 h-6 rounded-full border-2 border-white flex items-center justify-center shrink-0 mt-0.5",
                        result.isAuthentic ? "bg-emerald-100" : "bg-amber-100"
                      )}>
                        <div className={cn("w-2 h-2 rounded-full", result.isAuthentic ? "bg-emerald-500" : "bg-amber-500")}></div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">Software Encoding</p>
                        <p className="text-xs text-slate-500">{result.provenance.softwareEncoding}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-4 relative z-10">
                      <div className={cn(
                        "w-6 h-6 rounded-full border-2 border-white flex items-center justify-center shrink-0 mt-0.5",
                        result.isAuthentic ? "bg-emerald-100" : "bg-rose-100"
                      )}>
                        <div className={cn("w-2 h-2 rounded-full", result.isAuthentic ? "bg-emerald-500" : "bg-rose-500")}></div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800">Distribution</p>
                        <p className="text-xs text-slate-500">{result.provenance.distribution}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <p className="text-sm text-slate-600">
                      {result.provenance.reasoning}
                    </p>
                    
                    {(result.provenance.metadataAnomalies?.length > 0 || result.provenance.generativeTraces?.length > 0) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {result.provenance.metadataAnomalies?.map((anomaly, idx) => (
                          <span key={`anomaly-${idx}`} className="inline-flex items-center px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200/50">
                            {anomaly}
                          </span>
                        ))}
                        {result.provenance.generativeTraces?.map((trace, idx) => (
                          <span key={`trace-${idx}`} className="inline-flex items-center px-2 py-1 rounded-md bg-rose-50 text-rose-700 text-xs font-medium border border-rose-200/50">
                            {trace}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Explanation Engine & Spread Simulation */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Explanation Engine */}
                {result.explanationEngine && (
                  <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "p-2 rounded-xl",
                          result.explanationEngine.riskLevel === 'Low' ? "bg-emerald-50 text-emerald-600" :
                          result.explanationEngine.riskLevel === 'Medium' ? "bg-amber-50 text-amber-600" :
                          result.explanationEngine.riskLevel === 'High' ? "bg-orange-50 text-orange-600" :
                          "bg-rose-50 text-rose-600"
                        )}>
                          <ShieldAlert className="w-6 h-6" />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-900">Deepfake Explanation Engine</h3>
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-full text-sm font-medium border",
                        result.explanationEngine.riskLevel === 'Low' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                        result.explanationEngine.riskLevel === 'Medium' ? "bg-amber-50 text-amber-700 border-amber-200" :
                        result.explanationEngine.riskLevel === 'High' ? "bg-orange-50 text-orange-700 border-orange-200" :
                        "bg-rose-50 text-rose-700 border-rose-200"
                      )}>
                        {result.explanationEngine.riskLevel} Risk
                      </div>
                    </div>
                    <div className="flex-1 bg-slate-50 rounded-2xl p-5 border border-slate-100">
                      <p className="text-slate-700 text-sm leading-relaxed">
                        {result.explanationEngine.reasoning}
                      </p>
                    </div>
                  </div>
                )}

                {/* Spread Simulation */}
                {result.spreadSimulation && (
                  <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                        <Network className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-semibold text-slate-900">Cross-Platform Spread Simulation</h3>
                    </div>
                    <div className="relative">
                      <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-slate-100"></div>
                      <div className="space-y-6">
                        {result.spreadSimulation.platforms?.map((platform, idx) => (
                          <div key={idx} className="relative z-10 flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-white border-2 border-blue-100 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                            </div>
                            <div className="flex-1 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-semibold text-slate-800">{platform.platformName}</span>
                                <span className={cn(
                                  "text-xs font-bold px-2 py-1 rounded-md",
                                  platform.trustScore > 70 ? "bg-emerald-100 text-emerald-700" :
                                  platform.trustScore > 40 ? "bg-amber-100 text-amber-700" :
                                  "bg-rose-100 text-rose-700"
                                )}>
                                  Trust: {platform.trustScore}%
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed">
                                {platform.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* AI Model Attribution */}
              {result.modelAttribution && (
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Fingerprint className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-semibold text-slate-900">AI Model Attribution</h3>
                    </div>
                    <div className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-medium">
                      {result.modelAttribution.confidence}% Match
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-slate-500 mb-1">Detected Architecture</p>
                        <p className={cn(
                          "text-lg font-medium",
                          result.modelAttribution.detectedArchitecture.toLowerCase().includes('real') ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {result.modelAttribution.detectedArchitecture}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-500 mb-2">Possible Sources</p>
                        <div className="flex flex-wrap gap-2">
                          {result.modelAttribution.possibleSources?.map((source, i) => (
                            <span key={i} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-sm">
                              {source}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 mb-2">Forensic Reasoning</p>
                      <p className="text-slate-600 text-sm leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        {result.modelAttribution.reasoning}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Detailed Agent Reports */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Spatial Analysis */}
                <div 
                  className={cn(
                    "rounded-3xl p-6 shadow-sm border relative overflow-hidden cursor-pointer transition-all duration-300",
                    result.spatial.score > 70 ? "bg-emerald-50/30 border-emerald-100 hover:bg-emerald-50/50" : "bg-rose-50/30 border-rose-100 hover:bg-rose-50/50",
                    expandedAgent === 'spatial' ? "col-span-1 md:col-span-2 lg:col-span-3" : ""
                  )}
                  onClick={() => setExpandedAgent(expandedAgent === 'spatial' ? null : 'spatial')}
                >
                  <div className={cn(
                    "absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2 pointer-events-none",
                    result.spatial.score > 70 ? "bg-emerald-400" : "bg-rose-400"
                  )} />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          result.spatial.score > 70 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                        )}>
                          <Eye className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-800">Spatial Analysis</h3>
                          <p className="text-xs text-slate-500">CNN / ViT Agent</p>
                        </div>
                      </div>
                      <span className={cn(
                        "text-xs font-semibold px-2.5 py-1 rounded-full",
                        result.spatial.score > 70 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      )}>
                        {result.spatial.score > 70 ? 'Pass' : 'Fail'}
                      </span>
                    </div>
                    
                    <div className={cn("w-full mb-4 transition-all duration-300", expandedAgent === 'spatial' ? "h-64" : "h-32")}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={formatChartData(result.spatial.chartData, 'confidence')} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorSpatial" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={result.spatial.score > 70 ? "#34d399" : "#fb7185"} stopOpacity={0.3}/>
                              <stop offset="95%" stopColor={result.spatial.score > 70 ? "#34d399" : "#fb7185"} stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="time" tick={{fontSize: 10, fill: '#94a3b8'}} tickLine={false} axisLine={false} />
                          <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} tickLine={false} axisLine={false} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            labelStyle={{ color: '#64748b', fontSize: '12px' }}
                            itemStyle={{ color: '#0f172a', fontSize: '14px', fontWeight: 500 }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="confidence" 
                            stroke={result.spatial.score > 70 ? "#10b981" : "#f43f5e"} 
                            fillOpacity={1} 
                            fill="url(#colorSpatial)" 
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-sm text-slate-600 mb-4">
                      {result.spatial.reasoning}
                    </p>

                    {expandedAgent === 'spatial' && result.spatial.details && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="pt-4 border-t border-slate-200/60"
                      >
                        <div className="mb-4">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Algorithm Used</span>
                          <p className="text-sm font-medium text-slate-800 mt-1">{result.spatial.details.algorithmUsed}</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {result.spatial.details.keyMetrics.map((metric, idx) => (
                            <div key={idx} className="bg-white/60 rounded-xl p-3 border border-white/80">
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-xs text-slate-500">{metric.name}</span>
                                <span className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                  metric.status === 'Pass' ? "bg-emerald-100 text-emerald-700" :
                                  metric.status === 'Warning' ? "bg-amber-100 text-amber-700" :
                                  "bg-rose-100 text-rose-700"
                                )}>{metric.status}</span>
                              </div>
                              <span className="text-sm font-medium text-slate-800">{metric.value}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Biological Signal */}
                <div 
                  className={cn(
                    "rounded-3xl p-6 shadow-sm border relative overflow-hidden cursor-pointer transition-all duration-300",
                    result.biological.score > 70 ? "bg-emerald-50/30 border-emerald-100 hover:bg-emerald-50/50" : "bg-rose-50/30 border-rose-100 hover:bg-rose-50/50",
                    expandedAgent === 'biological' ? "col-span-1 md:col-span-2 lg:col-span-3" : ""
                  )}
                  onClick={() => setExpandedAgent(expandedAgent === 'biological' ? null : 'biological')}
                >
                  <div className={cn(
                    "absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2 pointer-events-none",
                    result.biological.score > 70 ? "bg-emerald-400" : "bg-rose-400"
                  )} />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          result.biological.score > 70 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                        )}>
                          <Activity className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-800">Biological Signal</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-slate-500">rPPG Extraction Agent</p>
                            <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100">
                              <HeartPulse className="w-3 h-3" />
                              Pulse Detector
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className={cn(
                        "text-xs font-semibold px-2.5 py-1 rounded-full",
                        result.biological.score > 70 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      )}>
                        {result.biological.score > 70 ? 'Pass' : 'Critical Fail'}
                      </span>
                    </div>
                    
                    <div className={cn("w-full mb-4 transition-all duration-300", expandedAgent === 'biological' ? "h-64" : "h-32")}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={formatChartData(result.biological.chartData, 'value')} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="time" tick={{fontSize: 10, fill: '#94a3b8'}} tickLine={false} axisLine={false} />
                          <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} tickLine={false} axisLine={false} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            labelStyle={{ color: '#64748b', fontSize: '12px' }}
                            itemStyle={{ color: '#0f172a', fontSize: '14px', fontWeight: 500 }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="value" 
                            stroke={result.biological.score > 70 ? "#10b981" : "#f43f5e"} 
                            strokeWidth={2} 
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-sm text-slate-600 mb-4">
                      {result.biological.reasoning}
                    </p>

                    {expandedAgent === 'biological' && result.biological.details && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="pt-4 border-t border-slate-200/60"
                      >
                        <div className="mb-4">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Algorithm Used</span>
                          <p className="text-sm font-medium text-slate-800 mt-1">{result.biological.details.algorithmUsed}</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {result.biological.details.keyMetrics.map((metric, idx) => (
                            <div key={idx} className="bg-white/60 rounded-xl p-3 border border-white/80">
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-xs text-slate-500">{metric.name}</span>
                                <span className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                  metric.status === 'Pass' ? "bg-emerald-100 text-emerald-700" :
                                  metric.status === 'Warning' ? "bg-amber-100 text-amber-700" :
                                  "bg-rose-100 text-rose-700"
                                )}>{metric.status}</span>
                              </div>
                              <span className="text-sm font-medium text-slate-800">{metric.value}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

                {/* Temporal Behavior */}
                <div 
                  className={cn(
                    "rounded-3xl p-6 shadow-sm border relative overflow-hidden cursor-pointer transition-all duration-300",
                    result.temporal.score > 70 ? "bg-emerald-50/30 border-emerald-100 hover:bg-emerald-50/50" : "bg-amber-50/30 border-amber-100 hover:bg-amber-50/50",
                    expandedAgent === 'temporal' ? "col-span-1 md:col-span-2 lg:col-span-3" : ""
                  )}
                  onClick={() => setExpandedAgent(expandedAgent === 'temporal' ? null : 'temporal')}
                >
                  <div className={cn(
                    "absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/2 pointer-events-none",
                    result.temporal.score > 70 ? "bg-emerald-400" : "bg-amber-400"
                  )} />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          result.temporal.score > 70 ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                        )}>
                          <Clock className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-800">Temporal Behavior</h3>
                          <p className="text-xs text-slate-500">GRU Sequence Agent</p>
                        </div>
                      </div>
                      <span className={cn(
                        "text-xs font-semibold px-2.5 py-1 rounded-full",
                        result.temporal.score > 70 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {result.temporal.score > 70 ? 'Pass' : 'Warning'}
                      </span>
                    </div>
                    
                    <div className={cn("w-full mb-4 transition-all duration-300", expandedAgent === 'temporal' ? "h-64" : "h-32")}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={formatChartData(result.temporal.chartData, 'consistency')} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorTemporal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={result.temporal.score > 70 ? "#34d399" : "#fbbf24"} stopOpacity={0.3}/>
                              <stop offset="95%" stopColor={result.temporal.score > 70 ? "#34d399" : "#fbbf24"} stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="time" tick={{fontSize: 10, fill: '#94a3b8'}} tickLine={false} axisLine={false} />
                          <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} tickLine={false} axisLine={false} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            labelStyle={{ color: '#64748b', fontSize: '12px' }}
                            itemStyle={{ color: '#0f172a', fontSize: '14px', fontWeight: 500 }}
                          />
                          <Area 
                            type="step" 
                            dataKey="consistency" 
                            stroke={result.temporal.score > 70 ? "#10b981" : "#f59e0b"} 
                            fillOpacity={1} 
                            fill="url(#colorTemporal)" 
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-sm text-slate-600 mb-4">
                      {result.temporal.reasoning}
                    </p>

                    {expandedAgent === 'temporal' && result.temporal.details && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="pt-4 border-t border-slate-200/60"
                      >
                        <div className="mb-4">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Algorithm Used</span>
                          <p className="text-sm font-medium text-slate-800 mt-1">{result.temporal.details.algorithmUsed}</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {result.temporal.details.keyMetrics.map((metric, idx) => (
                            <div key={idx} className="bg-white/60 rounded-xl p-3 border border-white/80">
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-xs text-slate-500">{metric.name}</span>
                                <span className={cn(
                                  "text-[10px] font-bold px-1.5 py-0.5 rounded",
                                  metric.status === 'Pass' ? "bg-emerald-100 text-emerald-700" :
                                  metric.status === 'Warning' ? "bg-amber-100 text-amber-700" :
                                  "bg-rose-100 text-rose-700"
                                )}>{metric.status}</span>
                              </div>
                              <span className="text-sm font-medium text-slate-800">{metric.value}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>

              </div>

              {/* Voice Authenticity Module */}
              {result.voice && (
                <div className={cn(
                  "rounded-3xl p-8 shadow-sm border relative overflow-hidden",
                  result.voice.score > 70 ? "bg-emerald-50/30 border-emerald-100" : "bg-rose-50/30 border-rose-100"
                )}>
                  <div className={cn(
                    "absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/3 pointer-events-none",
                    result.voice.score > 70 ? "bg-emerald-400" : "bg-rose-400"
                  )} />
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-8">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center",
                          result.voice.score > 70 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                        )}>
                          <AudioWaveform className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-xl font-semibold text-slate-800">Voice Clone Fingerprint</h3>
                          <p className="text-sm text-slate-500">Audio Authenticity Module</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-2xl font-bold text-slate-800">{result.voice.score}%</div>
                          <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Authenticity Score</div>
                        </div>
                        <span className={cn(
                          "text-sm font-semibold px-4 py-2 rounded-full",
                          result.voice.score > 70 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                        )}>
                          {result.voice.score > 70 ? 'Authentic Audio' : 'Synthetic Voice Detected'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      <div className="lg:col-span-2">
                        <h4 className="text-sm font-medium text-slate-700 mb-4">Pitch Curve & Mel Spectrogram Analysis</h4>
                        <div className="h-64 w-full bg-white/50 rounded-2xl p-4 border border-white/60">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={formatChartData(result.voice.chartData, 'frequency')} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <defs>
                                <linearGradient id="colorVoice" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={result.voice.score > 70 ? "#34d399" : "#fb7185"} stopOpacity={0.4}/>
                                  <stop offset="95%" stopColor={result.voice.score > 70 ? "#34d399" : "#fb7185"} stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                              <XAxis dataKey="time" tick={{fontSize: 10, fill: '#94a3b8'}} tickLine={false} axisLine={false} />
                              <YAxis tick={{fontSize: 10, fill: '#94a3b8'}} tickLine={false} axisLine={false} />
                              <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                labelStyle={{ color: '#64748b', fontSize: '12px' }}
                                itemStyle={{ color: '#0f172a', fontSize: '14px', fontWeight: 500 }}
                              />
                              <Area 
                                type="monotone" 
                                dataKey="frequency" 
                                stroke={result.voice.score > 70 ? "#10b981" : "#f43f5e"} 
                                fillOpacity={1} 
                                fill="url(#colorVoice)" 
                                strokeWidth={3}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="space-y-6">
                        <div>
                          <h4 className="text-sm font-medium text-slate-700 mb-3">Forensic Indicators</h4>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-white/60 rounded-xl border border-white/80">
                              <span className="text-sm text-slate-600">Synthetic Harmonic Pattern</span>
                              {result.voice.indicators?.syntheticHarmonics ? (
                                <span className="flex items-center gap-1 text-xs font-medium text-rose-600 bg-rose-100 px-2 py-1 rounded-md"><AlertCircle className="w-3 h-3"/> Detected</span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded-md"><CheckCircle2 className="w-3 h-3"/> Normal</span>
                              )}
                            </div>
                            <div className="flex items-center justify-between p-3 bg-white/60 rounded-xl border border-white/80">
                              <span className="text-sm text-slate-600">Natural Breath Noise</span>
                              {!result.voice.indicators?.naturalBreathNoise ? (
                                <span className="flex items-center gap-1 text-xs font-medium text-rose-600 bg-rose-100 px-2 py-1 rounded-md"><AlertCircle className="w-3 h-3"/> Missing</span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded-md"><CheckCircle2 className="w-3 h-3"/> Present</span>
                              )}
                            </div>
                            <div className="flex items-center justify-between p-3 bg-white/60 rounded-xl border border-white/80">
                              <span className="text-sm text-slate-600">Uniform Pitch Curve</span>
                              {result.voice.indicators?.uniformPitchCurve ? (
                                <span className="flex items-center gap-1 text-xs font-medium text-rose-600 bg-rose-100 px-2 py-1 rounded-md"><AlertCircle className="w-3 h-3"/> Detected</span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded-md"><CheckCircle2 className="w-3 h-3"/> Normal</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-slate-700 mb-2">Analysis Reasoning</h4>
                          <p className="text-sm text-slate-600 leading-relaxed">
                            {result.voice.reasoning}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              </div>

              {/* Video Playback (Outside of report-content so it's not exported) */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <FileVideo className="w-5 h-5 text-slate-400" />
                    Analyzed Media {videoUrl ? '' : '(Heatmap Only)'}
                  </h3>
                  <button
                    onClick={() => setShowHeatmap(!showHeatmap)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border",
                      showHeatmap 
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200" 
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    <Scan className="w-4 h-4" />
                    {showHeatmap ? 'Hide Heatmap' : 'Show Manipulation Heatmap'}
                  </button>
                </div>
                <div className="rounded-2xl overflow-hidden bg-slate-900 aspect-video relative">
                  {videoUrl ? (
                    <video 
                      src={videoUrl} 
                      controls 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500 flex-col gap-4">
                      <FileVideo className="w-12 h-12 opacity-50" />
                      <p>Original media not available for past reports</p>
                    </div>
                  )}
                  
                  {/* Heatmap Overlay */}
                    <AnimatePresence>
                      {showHeatmap && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center"
                        >
                          {!result.isAuthentic ? (
                            <div className="relative w-full h-full max-w-[80%] max-h-[80%] m-auto">
                              {/* Face Region */}
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: [0.4, 0.7, 0.4], scale: 1 }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="absolute top-[15%] left-[35%] w-[30%] h-[40%] bg-rose-500/40 blur-xl rounded-[40%]"
                              />
                              <div className="absolute top-[10%] left-[65%] bg-slate-900/90 backdrop-blur border border-rose-500/50 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                                Facial Replacement Detected
                              </div>

                              {/* Lip Sync */}
                              <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0.3, 0.6, 0.3] }}
                                transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                                className="absolute top-[42%] left-[45%] w-[10%] h-[8%] bg-amber-500/40 blur-md rounded-full"
                              />
                              <div className="absolute top-[52%] left-[55%] bg-slate-900/90 backdrop-blur border border-amber-500/50 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                Lip Sync Mismatch
                              </div>

                              {/* Frame Interpolation */}
                              <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0.2, 0.5, 0.2] }}
                                transition={{ duration: 3, repeat: Infinity, delay: 1 }}
                                className="absolute bottom-[10%] left-[10%] w-[80%] h-[15%] bg-purple-500/30 blur-2xl rounded-full"
                              />
                              <div className="absolute bottom-[20%] left-[15%] bg-slate-900/90 backdrop-blur border border-purple-500/50 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                                Interpolation Artifacts
                              </div>
                            </div>
                          ) : (
                            <div className="relative w-full h-full overflow-hidden">
                              <motion.div 
                                initial={{ top: '-10%' }}
                                animate={{ top: '110%' }}
                                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                className="absolute left-0 right-0 h-1 bg-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.8)]"
                              />
                              <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur border border-emerald-500/50 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                No Anomalies Detected
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
            </motion.div>
          )}
          {activeTab === 'Settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col gap-8 max-w-3xl mx-auto w-full"
            >
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Settings</h1>
                <p className="text-slate-500 mt-2">Manage your DeepTrace preferences and configurations.</p>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-8">
                <div>
                  <h3 className="text-lg font-medium text-slate-900 mb-4">API Configuration</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Custom Gemini API Key</label>
                      <input
                        type="password"
                        value={customApiKey}
                        onChange={(e) => setCustomApiKey(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 bg-slate-50"
                      />
                      <p className="text-xs text-slate-500 mt-1.5">Overrides the default system API key for higher rate limits.</p>
                    </div>
                  </div>
                </div>

                <hr className="border-slate-100" />

                <div>
                  <h3 className="text-lg font-medium text-slate-900 mb-4">Analysis Preferences</h3>
                  <div className="space-y-4">
                    <label className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                      <div>
                        <p className="font-medium text-slate-800">Auto-save to History</p>
                        <p className="text-sm text-slate-500">Automatically save analysis results to local history.</p>
                      </div>
                      <div className="w-11 h-6 bg-emerald-500 rounded-full relative">
                        <div className="absolute right-1 top-1 bg-white w-4 h-4 rounded-full shadow-sm"></div>
                      </div>
                    </label>
                    <label className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors">
                      <div>
                        <p className="font-medium text-slate-800">Detailed PDF Reports</p>
                        <p className="text-sm text-slate-500">Include raw agent data in exported PDF reports.</p>
                      </div>
                      <div className="w-11 h-6 bg-emerald-500 rounded-full relative">
                        <div className="absolute right-1 top-1 bg-white w-4 h-4 rounded-full shadow-sm"></div>
                      </div>
                    </label>
                  </div>
                </div>

                <hr className="border-slate-100" />

                <div>
                  <h3 className="text-lg font-medium text-slate-900 mb-4">System</h3>
                  <button 
                    onClick={() => {
                      if (window.confirm('Are you sure you want to clear your analysis history?')) {
                        localStorage.removeItem('deepTraceHistory');
                        setHistory([]);
                      }
                    }}
                    className="px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-sm font-medium hover:bg-rose-100 transition-colors"
                  >
                    Clear Analysis History
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* History Modal */}
      <AnimatePresence>
        {showHistory && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowHistory(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
                    <History className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-slate-800">Analysis History</h2>
                    <p className="text-sm text-slate-500">Your recent deepfake forensic reports</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowHistory(false)}
                  className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                {history.length === 0 ? (
                  <div className="text-center py-12">
                    <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-500">No analysis history found.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {history.map((item) => (
                      <div 
                        key={item.id} 
                        className="bg-slate-50 rounded-2xl p-4 border border-slate-100 hover:border-emerald-200 hover:shadow-sm transition-all cursor-pointer flex items-center justify-between group"
                        onClick={() => loadHistoryItem(item)}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
                            item.isAuthentic ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                          )}>
                            {item.isAuthentic ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
                          </div>
                          <div>
                            <h3 className="font-medium text-slate-800 group-hover:text-emerald-700 transition-colors flex items-center gap-2">
                              {item.fileName}
                              {item.isAuthentic ? (
                                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <ShieldAlert className="w-4 h-4 text-rose-500" />
                              )}
                            </h3>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                              <span>{new Date(item.date).toLocaleDateString()} {new Date(item.date).toLocaleTimeString()}</span>
                              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                              <span className={item.isAuthentic ? "text-emerald-600 font-medium" : "text-rose-600 font-medium"}>
                                {item.trustScore}% Trust Score
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-slate-400 group-hover:text-emerald-500 transition-colors">
                          <Eye className="w-5 h-5" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
