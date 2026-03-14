import { GoogleGenAI, Type } from '@google/genai';

export interface AgentDetails {
  algorithmUsed: string;
  keyMetrics: {
    name: string;
    value: string;
    status: 'Pass' | 'Fail' | 'Warning';
  }[];
}

export interface AnalysisResult {
  trustScore: number;
  isAuthentic: boolean;
  conclusion: string;
  spatial: {
    score: number;
    reasoning: string;
    chartData: number[];
    details: AgentDetails;
  };
  temporal: {
    score: number;
    reasoning: string;
    chartData: number[];
    details: AgentDetails;
  };
  biological: {
    score: number;
    reasoning: string;
    chartData: number[];
    details: AgentDetails;
  };
  voice: {
    score: number;
    reasoning: string;
    chartData: number[];
    indicators: {
      syntheticHarmonics: boolean;
      naturalBreathNoise: boolean;
      uniformPitchCurve: boolean;
    };
  };
  provenance: {
    score: number;
    reasoning: string;
    captureDevice: string;
    softwareEncoding: string;
    distribution: string;
    metadataAnomalies: string[];
    generativeTraces: string[];
  };
  modelAttribution: {
    detectedArchitecture: string;
    confidence: number;
    possibleSources: {
      name: string;
      description: string;
    }[];
    reasoning: string;
  };
  explanationEngine: {
    riskLevel: string;
    reasoning: string;
  };
  spreadSimulation: {
    platforms: {
      platformName: string;
      trustScore: number;
      description: string;
    }[];
  };
}

export async function analyzeVideo(file: File, customApiKey?: string): Promise<AnalysisResult> {
  const ai = new GoogleGenAI({ apiKey: customApiKey || process.env.GEMINI_API_KEY });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64String = (reader.result as string).split(',')[1];
        
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [
            {
              inlineData: {
                data: base64String,
                mimeType: file.type
              }
            },
            "You are DeepTrace, an elite, highly rigorous forensic AI system specialized in deepfake detection and generative model fingerprint attribution. Your objective is to maximize the true positive rate of deepfake detection, minimize false negatives, and identify the likely generative architecture used to produce manipulated content.\n\nAnalyze this video for any signs of manipulation, focusing intensely on:\n1. Spatial Anomalies (CNN/ViT): Look for blending boundaries, mismatched lighting, unnatural skin textures, missing or incorrect reflections, asymmetrical facial features, and anomalies in teeth or eyes.\n2. Temporal Behavior (GRU): Look for frame-to-frame flickering, unnatural or missing blinking, micro-expression inconsistencies, and lip-sync desynchronization.\n3. Biological Signals (rPPG): Analyze for the absence of natural micro-color changes in the skin (pulse) or unnatural vital signs.\n4. Provenance & Lineage: Analyze metadata inconsistencies, missing EXIF data, compression matrices, and traces of generative AI software or social media stripping.\n5. Model Fingerprint: Analyze visual artifact structures, frequency-domain patterns, texture distributions, noise characteristics, and audio spectral patterns to identify the generative signature (e.g., GAN-based Deepfake, Diffusion-based Generation, Face Swap Model, Voice Cloning Model, Unknown Synthetic Source, or Real Media).\n6. Voice Clone Fingerprint: Analyze audio for unnatural pitch, mel spectrogram artifacts, repeated waveform patterns, synthetic harmonic patterns, lack of natural breath noise, and uniform pitch curve.\n\nBe highly critical. If you detect even slight inconsistencies, lower the trust score significantly and flag the media as manipulated (isAuthentic: false). Provide a final trust score (0-100) and conclusion. Also generate realistic chart data arrays (30 data points each, values between 0 and 100) representing the frame-by-frame confidence for spatial, temporal, biological, and voice signals. Provide a detailed model attribution analysis.\n\nAlso, provide a human-readable explanation engine with a risk level (Low, Medium, High, Critical) and reasoning. Finally, simulate a likely cross-platform spread path for this media, showing how the trust score decreases across different platforms (e.g., WhatsApp -> Twitter -> Facebook) with descriptions of how the media might be perceived or altered.\n\nFor spatial, temporal, and biological analysis, include a 'details' object that specifies the 'algorithmUsed' (e.g., 'Vision Transformer (ViT-L/14)', 'Recurrent Neural Network (GRU)', 'Remote Photoplethysmography (rPPG)') and an array of 'keyMetrics' (name, value, status: 'Pass', 'Fail', or 'Warning').\n\nFor modelAttribution, provide an array of 'possibleSources', where each source has a 'name' (e.g., 'Midjourney v6', 'Runway Gen-2') and a 'description' explaining why this specific model is suspected based on the artifacts found."
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                trustScore: { type: Type.NUMBER, description: "0 to 100" },
                isAuthentic: { type: Type.BOOLEAN },
                conclusion: { type: Type.STRING },
                spatial: {
                  type: Type.OBJECT,
                  properties: {
                    score: { type: Type.NUMBER },
                    reasoning: { type: Type.STRING },
                    chartData: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                    details: {
                      type: Type.OBJECT,
                      properties: {
                        algorithmUsed: { type: Type.STRING },
                        keyMetrics: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              name: { type: Type.STRING },
                              value: { type: Type.STRING },
                              status: { type: Type.STRING }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                temporal: {
                  type: Type.OBJECT,
                  properties: {
                    score: { type: Type.NUMBER },
                    reasoning: { type: Type.STRING },
                    chartData: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                    details: {
                      type: Type.OBJECT,
                      properties: {
                        algorithmUsed: { type: Type.STRING },
                        keyMetrics: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              name: { type: Type.STRING },
                              value: { type: Type.STRING },
                              status: { type: Type.STRING }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                biological: {
                  type: Type.OBJECT,
                  properties: {
                    score: { type: Type.NUMBER },
                    reasoning: { type: Type.STRING },
                    chartData: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                    details: {
                      type: Type.OBJECT,
                      properties: {
                        algorithmUsed: { type: Type.STRING },
                        keyMetrics: {
                          type: Type.ARRAY,
                          items: {
                            type: Type.OBJECT,
                            properties: {
                              name: { type: Type.STRING },
                              value: { type: Type.STRING },
                              status: { type: Type.STRING }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                voice: {
                  type: Type.OBJECT,
                  properties: {
                    score: { type: Type.NUMBER },
                    reasoning: { type: Type.STRING },
                    chartData: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                    indicators: {
                      type: Type.OBJECT,
                      properties: {
                        syntheticHarmonics: { type: Type.BOOLEAN },
                        naturalBreathNoise: { type: Type.BOOLEAN },
                        uniformPitchCurve: { type: Type.BOOLEAN }
                      }
                    }
                  }
                },
                provenance: {
                  type: Type.OBJECT,
                  properties: {
                    score: { type: Type.NUMBER },
                    reasoning: { type: Type.STRING },
                    captureDevice: { type: Type.STRING },
                    softwareEncoding: { type: Type.STRING },
                    distribution: { type: Type.STRING },
                    metadataAnomalies: { type: Type.ARRAY, items: { type: Type.STRING } },
                    generativeTraces: { type: Type.ARRAY, items: { type: Type.STRING } }
                  }
                },
                modelAttribution: {
                  type: Type.OBJECT,
                  properties: {
                    detectedArchitecture: { type: Type.STRING },
                    confidence: { type: Type.NUMBER },
                    possibleSources: { 
                      type: Type.ARRAY, 
                      items: { 
                        type: Type.OBJECT,
                        properties: {
                          name: { type: Type.STRING },
                          description: { type: Type.STRING }
                        }
                      } 
                    },
                    reasoning: { type: Type.STRING }
                  }
                },
                explanationEngine: {
                  type: Type.OBJECT,
                  properties: {
                    riskLevel: { type: Type.STRING },
                    reasoning: { type: Type.STRING }
                  }
                },
                spreadSimulation: {
                  type: Type.OBJECT,
                  properties: {
                    platforms: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          platformName: { type: Type.STRING },
                          trustScore: { type: Type.NUMBER },
                          description: { type: Type.STRING }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        });
        
        const text = response.text;
        if (!text) throw new Error("No response from Gemini");
        resolve(JSON.parse(text));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
