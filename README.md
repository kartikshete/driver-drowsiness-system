# 🚗 Driver Drowsiness System (DriverGuard)

**DriverGuard** is a high-safety computer vision application designed to prevent road accidents caused by driver fatigue. It uses **MediaPipe Face Landmarker** to track Eye Aspect Ratio (EAR) in real-time and triggers high-decibel alarms if drowsiness is detected.

### 🌟 Key Features
- **Real-time Fatigue Analysis**: Uses EAR (Eye Aspect Ratio) monitoring with < 1.5s detection latency.
- **Multi-lingual Support**: Dashboard and voice alerts in **English, Hindi, Marathi, and Hinglish**.
- **Custom Voice Alarms**: Record your own voice (e.g., family members) to wake you up effectively.
- **Fatigue Trend Analytics**: Visualizes your alertness levels over time using Recharts.
- **Live Fleet Tracking**: Integrated Leaflet maps for remote driver monitoring.

### 🛠️ Tech Stack
- **Core**: React 19, MediaPipe Tasks Vision
- **UI**: Tailwind CSS, Lucide React, Glass-morphism Design
- **Charts**: Recharts (Trends)
- **Maps**: Leaflet (Location Tracking)
- **Communication**: Socket.io (Remote Logs)

### 🚀 Getting Started
1. Run `npm install`.
2. Allow Camera access in the browser.
3. Start the system: `npm run dev`.

---
*Created by [Kartik Shete](https://github.com/kartikshete)*
