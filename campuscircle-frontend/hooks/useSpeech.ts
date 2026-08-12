"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export function useSpeech() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Initialize Speech Recognition and Synthesis Voices
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Eagerly load voices
      const loadVoices = () => {
        setAvailableVoices(window.speechSynthesis.getVoices());
      };
      
      loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = "en-US"; // Default, could be made dynamic

        recognitionRef.current.onresult = (event: any) => {
          let currentTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
        };

        recognitionRef.current.onerror = (event: any) => {
          setIsListening(false);
          if (event.error === "network") {
            alert("Speech recognition failed due to a network error. If you are using Brave or Firefox, this feature may be blocked by privacy shields. Please try using Google Chrome or Microsoft Edge.");
          }
        };

        recognitionRef.current.onend = () => {
          setIsListening(false);
        };
      }
    }
  }, []);

  const startListening = useCallback((lang: string = "en-US") => {
    if (isListening) return;
    setTranscript("");
    if (recognitionRef.current) {
      try {
        recognitionRef.current.lang = lang;
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        // silently ignore if already started
      }
    } else {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  // Helper to detect language script
  const detectLanguage = (text: string) => {
    if (/[\u0900-\u097F]/.test(text)) return "hi-IN"; // Devanagari (Hindi)
    if (/[\u0A80-\u0AFF]/.test(text)) return "gu-IN"; // Gujarati
    // For Spanish and French, simple heuristic or fallback to browser default
    if (/\b(el|la|los|las|un|una|con|por|para)\b/i.test(text)) return "es-ES"; // Spanish
    if (/\b(le|la|les|un|une|avec|pour|dans)\b/i.test(text)) return "fr-FR"; // French
    return "en-IN"; // Default to Indian English accent
  };

  const [currentlySpeaking, setCurrentlySpeaking] = useState<string | null>(null);

  const speak = useCallback((text: string, id?: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const identifier = id || text;
      
      // If something is speaking, stop it
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
        // If we clicked the same thing that was speaking, just stop and return
        if (currentlySpeaking === identifier) {
          setCurrentlySpeaking(null);
          return;
        }
      }

      const cleanText = text.replace(/[*#_`~]/g, "");
      const utterance = new SpeechSynthesisUtterance(cleanText);
      const targetLang = detectLanguage(cleanText);
      utterance.lang = targetLang;
      
      // Attempt to find a high-quality native voice
      if (availableVoices.length > 0) {
        // Prefer Google voices (cloud-based, highly realistic) or natively designated local voices
        const bestVoice = availableVoices.find(v => v.lang === targetLang && (v.name.includes("Google") || v.name.includes("Natural"))) ||
                          availableVoices.find(v => v.lang === targetLang) ||
                          availableVoices.find(v => v.lang.startsWith(targetLang.split('-')[0]));
        if (bestVoice) {
          utterance.voice = bestVoice;
        }
      }

      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onend = () => setCurrentlySpeaking(null);
      utterance.onerror = () => setCurrentlySpeaking(null);

      setCurrentlySpeaking(identifier);
      window.speechSynthesis.speak(utterance);
    }
  }, [currentlySpeaking]);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setCurrentlySpeaking(null);
    }
  }, []);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    setTranscript,
    currentlySpeaking
  };
}
