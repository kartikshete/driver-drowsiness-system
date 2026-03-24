
import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { io } from 'socket.io-client';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import {
  AlertTriangle,
  Activity,
  Clock,
  History,
  Settings as SettingsIcon,
  Map as MapIcon,
  LayoutDashboard,
  ShieldAlert,
  Mic,
  Upload,
  Volume2,
  Globe,
  Trash2,
  Bell
} from 'lucide-react';

// Fix Leaflet Marker Icon for Mobile
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const translations = {
  english: {
    dashboard: "Dashboard",
    map: "Map",
    history: "Logs",
    settings: "Settings",
    systemActive: "Active",
    initializing: "Initializing...",
    realTimeAnalysis: "Live Feed",
    fatigueAnalysis: "Fatigue Trend",
    stayAwake: "STAY AWAKE!!",
    driverAttentive: "Driver OK",
    remoteLogFeed: "Logs",
    alarmSettings: "Alarm & Language",
    languageSelect: "Language",
    earFactor: "EAR",
    startRecord: "Record",
    stopRecord: "Stop",
    uploadAudio: "Upload"
  },
  hindi: {
    dashboard: "डैशबोर्ड",
    map: "मानचित्र",
    history: "लॉग",
    settings: "सेटिंग्स",
    systemActive: "सक्रिय",
    initializing: "शुरू हो रहा है...",
    realTimeAnalysis: "लाइव फीड",
    fatigueAnalysis: "थकान विश्लेषण",
    stayAwake: "जागते रहो!!",
    driverAttentive: "ड्राइवर ठीक है",
    remoteLogFeed: "लॉग",
    alarmSettings: "अलार्म और भाषा",
    languageSelect: "भाषा",
    earFactor: "EAR",
    startRecord: "रिकॉर्ड",
    stopRecord: "बंद करें",
    uploadAudio: "अपलोड"
  },
  marathi: {
    dashboard: "डॅशबोर्ड",
    map: "नकाशा",
    history: "लॉग",
    settings: "सेटिंग्ज",
    systemActive: "सक्रिय",
    initializing: "प्रारंभ होत आहे...",
    realTimeAnalysis: "लाईव्ह फीड",
    fatigueAnalysis: "थकवा विश्लेषण",
    stayAwake: "जागे राहा!!",
    driverAttentive: "ड्रायव्हर ओके",
    remoteLogFeed: "लॉग",
    alarmSettings: "अलार्म आणि भाषा",
    languageSelect: "भाषा",
    earFactor: "EAR",
    startRecord: "रेकॉर्ड",
    stopRecord: "थांबवा",
    uploadAudio: "अपलोड"
  },
  hinglish: {
    dashboard: "Dashboard",
    map: "Map",
    history: "Logs",
    settings: "Settings",
    systemActive: "Challu Hai",
    initializing: "Wait Karo...",
    realTimeAnalysis: "Live Feed",
    fatigueAnalysis: "Need Score",
    stayAwake: "SO MAT JAANA!!",
    driverAttentive: "Sab Sahi Hai",
    remoteLogFeed: "Logs",
    alarmSettings: "Alarm Settings",
    languageSelect: "Language",
    earFactor: "Score",
    startRecord: "Record Karo",
    stopRecord: "Stop Karo",
    uploadAudio: "Upload"
  }
};

const socket = io('http://localhost:3001');

function App() {
  const webcamRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const requestRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  const alertAudioRef = useRef(null);
  const audioPlaybackRef = useRef(null);
  const drowsinessStartTimeRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [loading, setLoading] = useState(true);
  const [drowsyDetected, setDrowsyDetected] = useState(false);
  const [earValue, setEarValue] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [earHistory, setEarHistory] = useState([]);
  const [alarmMode, setAlarmMode] = useState('police');
  const [customAudioUrl, setCustomAudioUrl] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [language, setLanguage] = useState('english');
  const [faceInView, setFaceInView] = useState(false);

  const t = translations[language];

  // Camera Permission Effect
  useEffect(() => {
    if (activeTab === 'dashboard') {
      const checkCamera = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach(track => track.stop());
        } catch (err) {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            alert("🚨 CAMERA BLOCKED: Please allow camera access in browser settings.");
          }
        }
      };
      checkCamera();
    }
  }, [activeTab]);

  // Socket Connection Effect
  useEffect(() => {
    socket.on('new_alert', (newAlert) => setAlerts(prev => [newAlert, ...prev].slice(0, 10)));
    fetch('http://localhost:3001/api/alerts').then(res => res.json()).then(data => setAlerts(data.slice(0, 10))).catch(() => { });
    return () => { socket.off('new_alert'); };
  }, []);

  // EAR History Effect
  useEffect(() => {
    const interval = setInterval(() => {
      setEarHistory(prev => [...prev, { time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), ear: Math.max(0, earValue) }].slice(-20));
    }, 1000);
    return () => clearInterval(interval);
  }, [earValue]);

  // Load MediaPipe Model
  useEffect(() => {
    async function loadModel() {
      try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
        faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "GPU" },
          outputFaceBlendshapes: true, runningMode: "VIDEO", numFaces: 1
        });
        setLoading(false);
      } catch (err) {
        console.error("Model load error:", err);
      }
    }
    loadModel();
  }, []);

  // Audio Functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && audioChunksRef.current.push(e.data);
      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setCustomAudioUrl(URL.createObjectURL(audioBlob));
        setAlarmMode('custom');
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      alert("Microphone Error: " + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCustomAudioUrl(URL.createObjectURL(file));
      setAlarmMode('custom');
    }
  };

  const triggerAlarm = useCallback((active) => {
    if (active) {
      if (alarmMode !== 'custom' && !alertAudioRef.current) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(1.0, ctx.currentTime);

        let int;
        if (alarmMode === 'police') {
          osc1.type = 'sawtooth'; osc2.type = 'square';
          int = setInterval(() => {
            try {
              osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
              osc1.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.6);
            } catch (e) { }
          }, 600);
        } else if (alarmMode === 'ambulance') {
          osc1.type = 'sine'; osc2.type = 'sawtooth';
          int = setInterval(() => {
            try {
              osc1.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.8);
              osc1.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 1.6);
            } catch (e) { }
          }, 1600);
        } else if (alarmMode === 'radar') {
          osc1.type = 'square';
          int = setInterval(() => {
            try {
              osc1.frequency.setValueAtTime(1500, ctx.currentTime);
              setTimeout(() => { if (ctx.state !== 'closed') osc1.frequency.setValueAtTime(0.0001, ctx.currentTime); }, 100);
            } catch (e) { }
          }, 300);
        } else if (alarmMode === 'nuclear') {
          osc1.type = 'sawtooth';
          int = setInterval(() => {
            try {
              osc1.frequency.linearRampToValueAtTime(300, ctx.currentTime + 1.0);
              osc1.frequency.linearRampToValueAtTime(100, ctx.currentTime + 2.0);
            } catch (e) { }
          }, 2000);
        } else if (alarmMode === 'fire') {
          osc1.type = 'square';
          int = setInterval(() => {
            try {
              gain.gain.setValueAtTime(1.0, ctx.currentTime);
              setTimeout(() => { if (ctx.state !== 'closed') gain.gain.setValueAtTime(0, ctx.currentTime); }, 150);
            } catch (e) { }
          }, 300);
        }

        osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
        osc1.start(); osc2.start();
        alertAudioRef.current = { ctx, osc1, osc2, int };
      } else if (alarmMode === 'custom' && customAudioUrl && !audioPlaybackRef.current) {
        const audio = new Audio(customAudioUrl);
        audio.loop = true; audio.volume = 1.0; audio.play();
        audioPlaybackRef.current = audio;
      }
    } else {
      if (alertAudioRef.current) {
        clearInterval(alertAudioRef.current.int);
        try { alertAudioRef.current.osc1.stop(); alertAudioRef.current.osc2.stop(); } catch (e) { }
        alertAudioRef.current.ctx.close(); alertAudioRef.current = null;
      }
      if (audioPlaybackRef.current) {
        audioPlaybackRef.current.pause(); audioPlaybackRef.current = null;
      }
    }
  }, [alarmMode, customAudioUrl]);

  const earHistoryBuffer = useRef([]);
  const runDetection = useCallback(async () => {
    if (activeTab === 'dashboard' && webcamRef.current?.video?.readyState === 4 && faceLandmarkerRef.current) {
      const video = webcamRef.current.video;
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          const results = faceLandmarkerRef.current.detectForVideo(video, Date.now());
          if (results.faceLandmarks?.length > 0) {
            setFaceInView(true);
            const landmarks = results.faceLandmarks[0];
            const dist = (p1, p2) => Math.hypot(landmarks[p1].x - landmarks[p2].x, landmarks[p1].y - landmarks[p2].y);
            const currentEar = ((dist(385, 380) + dist(387, 373)) / (2 * dist(362, 263)) + (dist(160, 144) + dist(158, 153)) / (2 * dist(33, 133))) / 2;

            earHistoryBuffer.current.push(currentEar);
            if (earHistoryBuffer.current.length > 10) earHistoryBuffer.current.shift();
            const smoothedEar = earHistoryBuffer.current.reduce((a, b) => a + b) / earHistoryBuffer.current.length;
            setEarValue(smoothedEar);

            // Tuned for "Must be real closed eyes"
            if (smoothedEar < 0.20) {
              if (!drowsinessStartTimeRef.current) drowsinessStartTimeRef.current = Date.now();
              else if ((Date.now() - drowsinessStartTimeRef.current) > 1500) {
                setDrowsyDetected(true);
                triggerAlarm(true);
              }
            } else {
              drowsinessStartTimeRef.current = null;
              setDrowsyDetected(false);
              triggerAlarm(false);
            }
          } else {
            setFaceInView(false);
            setDrowsyDetected(false);
            triggerAlarm(false);
          }
        } catch (e) { console.error(e); }
      }
    }
    requestRef.current = requestAnimationFrame(runDetection);
  }, [triggerAlarm, activeTab]);

  useEffect(() => {
    if (!loading) {
      requestRef.current = requestAnimationFrame(runDetection);
      return () => cancelAnimationFrame(requestRef.current);
    }
  }, [loading, runDetection]);

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Header */}
      <header className="flex items-center justify-between px-6 py-4 glass-morphism sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-600 rounded-lg shadow-lg shadow-blue-500/20">
            <ShieldAlert size={20} className="text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            DriverGuard
          </h1>
        </div>
        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${faceInView ? 'bg-success/20 text-success border border-success/30' : 'bg-danger/20 text-danger border border-danger/30'}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${faceInView ? 'bg-success animate-pulse' : 'bg-danger'}`} />
          {faceInView ? t.systemActive : 'No Face'}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-24">
        {activeTab === 'dashboard' && (
          <div className="px-5 py-6 space-y-6">
            {/* Action Alert Card */}
            <div className={`p-6 rounded-3xl transition-all duration-500 overflow-hidden relative ${drowsyDetected ? 'bg-danger pulse-red border-danger shadow-2xl shadow-danger/20' : 'glass-morphism'}`}>
              <div className="flex items-center justify-between relative z-10">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">Current Status</p>
                  <h3 className="text-2xl font-black">{drowsyDetected ? t.stayAwake : t.driverAttentive}</h3>
                </div>
                {drowsyDetected ? <AlertTriangle size={36} className="text-white" /> : <Activity size={32} className="text-blue-500" />}
              </div>
              <div className="mt-4 flex items-center gap-4 relative z-10">
                <div className="flex-1 bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${Math.min(100, earValue * 400)}%` }} />
                </div>
                <span className="text-xs font-mono font-bold">{earValue.toFixed(3)}</span>
              </div>
              {/* Decorative Background Icon */}
              <Bell size={120} className="absolute -bottom-8 -right-8 opacity-5 rotate-12" />
            </div>

            {/* Webcam Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-sm font-bold flex items-center gap-2 opacity-80"><Activity size={16} /> {t.realTimeAnalysis}</h4>
                <div className="flex items-center gap-2 text-[10px] opacity-40 font-mono tracking-tighter"><Clock size={12} /> {new Date().toLocaleTimeString()}</div>
              </div>
              <div className="relative aspect-[4/3] bg-black rounded-[2.5rem] overflow-hidden border-2 border-white/5 shadow-2xl">
                <Webcam
                  ref={webcamRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  mirrored={true}
                  videoConstraints={{ facingMode: "user" }}
                />
                {drowsyDetected && (
                  <div className="absolute inset-0 border-[12px] border-danger/80 animate-pulse pointer-events-none" />
                )}
                {/* Overlay Grid */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
              </div>
            </div>

            {/* Analysis Chart */}
            <div className="glass-morphism p-5 rounded-[2.5rem]">
              <h4 className="text-xs font-bold mb-4 opacity-60 uppercase tracking-widest">{t.fatigueAnalysis}</h4>
              <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={earHistory}>
                    <defs>
                      <linearGradient id="colorEar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="ear" stroke="#3b82f6" strokeWidth={2} fill="url(#colorEar)" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'map' && (
          <div className="h-full w-full relative">
            <div className="absolute inset-x-5 top-6 z-10 glass-morphism p-4 rounded-2xl flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Active Fleet</h3>
                <p className="text-[10px] opacity-50">Monitoring 1 vehicle</p>
              </div>
              <div className="bg-blue-600 p-2 rounded-xl"><MapIcon size={16} /></div>
            </div>
            <MapContainer center={[19.0760, 72.8777]} zoom={13} style={{ height: 'calc(100vh - 160px)', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" className="map-tiles" />
              <Marker position={[19.0760, 72.8777]}>
                <Popup>Driver Guard: Active</Popup>
              </Marker>
            </MapContainer>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="px-5 py-6 space-y-4">
            <h2 className="text-xl font-bold px-2">{t.history}</h2>
            {alerts.map((a, i) => (
              <div key={i} className="glass-morphism p-4 rounded-2xl flex items-center gap-4 animate-in slide-in-from-right duration-300" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="w-10 h-10 rounded-full bg-danger/20 flex items-center justify-center text-danger border border-danger/30">
                  <AlertTriangle size={18} />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-sm">{a.type} Detected</h4>
                  <p className="text-[10px] opacity-50">{new Date(a.timestamp).toLocaleTimeString()} • {new Date(a.timestamp).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-danger">{a.ear}</span>
                  <p className="text-[10px] opacity-30 uppercase">Score</p>
                </div>
              </div>
            ))}
            {alerts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 opacity-20">
                <History size={48} />
                <p className="mt-4 font-bold">No Records Yet</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="px-5 py-6 space-y-8">
            <h2 className="text-xl font-bold px-2">{t.alarmSettings}</h2>

            {/* Language Selection */}
            <div className="space-y-3">
              <label className="text-xs font-bold opacity-50 px-2 uppercase tracking-widest flex items-center gap-2"><Globe size={14} /> {t.languageSelect}</label>
              <div className="grid grid-cols-2 gap-2">
                {['english', 'hindi', 'marathi', 'hinglish'].map(l => (
                  <button key={l} onClick={() => setLanguage(l)}
                    className={`py-3 rounded-2xl font-bold text-xs capitalize transition-all border ${language === l ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-white/5 glass-morphism opacity-60'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Alarm Mode */}
            <div className="space-y-3">
              <label className="text-xs font-bold opacity-50 px-2 uppercase tracking-widest flex items-center gap-2"><Volume2 size={14} /> Siren Type</label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: 'police', label: 'Police Siren', desc: 'Classic High-Low Alert' },
                  { id: 'ambulance', label: 'Ambulance', desc: 'Slower Warble Alert' },
                  { id: 'radar', label: 'Radar Beep', desc: 'Sharp Fast Pulses' },
                  { id: 'nuclear', label: 'Nuclear Alert', desc: 'Heavy Low Frequency' },
                ].map(siren => (
                  <button key={siren.id} onClick={() => setAlarmMode(siren.id)}
                    className={`p-4 rounded-2xl flex items-center justify-between border transition-all ${alarmMode === siren.id ? 'border-blue-500 bg-blue-500/10' : 'border-white/5 glass-morphism'}`}>
                    <div className="text-left">
                      <h5 className="text-sm font-bold">{siren.label}</h5>
                      <p className="text-[10px] opacity-50">{siren.desc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 p-1 ${alarmMode === siren.id ? 'border-blue-500' : 'border-white/20'}`}>
                      {alarmMode === siren.id && <div className="w-full h-full bg-blue-500 rounded-full" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Audio */}
            <div className="glass-morphism p-5 rounded-[2.5rem] border border-red-500/10">
              <h5 className="text-sm font-bold mb-4 flex items-center gap-2 text-danger"><Mic size={18} /> Voice Alarm</h5>
              <div className="flex flex-col gap-4">
                {!isRecording ? (
                  <button onClick={startRecording} className="w-full bg-slate-100 text-slate-900 py-4 rounded-2xl font-black text-sm shadow-xl shadow-white/5">
                    {t.startRecord}
                  </button>
                ) : (
                  <button onClick={stopRecording} className="w-full bg-danger py-4 rounded-2xl font-black text-sm animate-pulse">
                    {t.stopRecord}
                  </button>
                )}
                <div className="flex gap-2">
                  <label className="flex-1 glass-morphism border border-white/5 py-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer">
                    <Upload size={14} /> {t.uploadAudio}
                    <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
                  </label>
                  {customAudioUrl && (
                    <button onClick={() => { setCustomAudioUrl(null); setAlarmMode('police'); }} className="p-3 bg-danger/20 text-danger rounded-2xl border border-danger/30">
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
                {customAudioUrl && (
                  <button onClick={() => setAlarmMode('custom')} className={`w-full py-3 rounded-2xl text-xs font-bold border transition-all ${alarmMode === 'custom' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-white/5 glass-morphism'}`}>
                    Use Your Voice Alarm
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 inset-x-0 glass-morphism border-t border-white/5 pb-8 pt-3 px-6 z-40">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'dashboard' ? 'text-blue-500 scale-110' : 'opacity-40 hover:opacity-100'}`}>
            <LayoutDashboard size={24} />
            <span className="text-[10px] font-bold uppercase tracking-widest">{t.dashboard}</span>
          </button>
          <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'map' ? 'text-blue-500 scale-110' : 'opacity-40 hover:opacity-100'}`}>
            <MapIcon size={24} />
            <span className="text-[10px] font-bold uppercase tracking-widest">{t.map}</span>
          </button>
          <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'history' ? 'text-blue-500 scale-110' : 'opacity-40 hover:opacity-100'}`}>
            <History size={24} />
            <span className="text-[10px] font-bold uppercase tracking-widest">{t.history}</span>
          </button>
          <button onClick={() => setActiveTab('settings')} className={`flex flex-col items-center gap-1 transition-all ${activeTab === 'settings' ? 'text-blue-500 scale-110' : 'opacity-40 hover:opacity-100'}`}>
            <SettingsIcon size={24} />
            <span className="text-[10px] font-bold uppercase tracking-widest">{t.settings}</span>
          </button>
        </div>
      </nav>

      {/* Initial Loading State */}
      {loading && (
        <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-50 p-10 text-center">
          <div className="relative mb-8">
            <Activity size={64} className="text-blue-600 animate-pulse" />
            <div className="absolute inset-0 bg-blue-600 blur-3xl opacity-20 animate-pulse" />
          </div>
          <h2 className="text-3xl font-black italic tracking-tighter uppercase mb-2">DRIVERGUARD</h2>
          <p className="text-xs font-bold opacity-40 uppercase tracking-[0.3em]">{t.initializing}</p>
        </div>
      )}
    </div>
  );
}

export default App;

// System update 2
// System update 11
// System update 20
// System update 23