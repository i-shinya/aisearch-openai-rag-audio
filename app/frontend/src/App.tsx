import { useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { GroundingFiles } from "@/components/ui/grounding-files";
import GroundingFileView from "@/components/ui/grounding-file-view";
import StatusMessage from "@/components/ui/status-message";

import useRealTime from "@/hooks/useRealtime";
import useAudioRecorder from "@/hooks/useAudioRecorder";
// import useAudioPlayer from "@/hooks/useAudioPlayer";

import { GroundingFile, ToolResult } from "./types";

import logo from "./assets/logo.svg";

function App() {
    const [isRecording, setIsRecording] = useState(false);
    const [groundingFiles, setGroundingFiles] = useState<GroundingFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<GroundingFile | null>(null);

    const { startSession, inputAudioBufferClear, chatLogs, clearChatlogs } = useRealTime({
        onDataChannelOpened: () => {
            setIsRecording(true);
        },
        onReceivedError: message => console.error("error", message),
        onReceivedInputAudioBufferSpeechStarted: () => {
            // stopAudioPlayer();
        },
        onReceivedExtensionMiddleTierToolResponse: message => {
            const result: ToolResult = JSON.parse(message.tool_result);

            const files: GroundingFile[] = result.sources.map(x => {
                return { id: x.chunk_id, name: x.title, content: x.chunk };
            });

            setGroundingFiles(prev => [...prev, ...files]);
        }
    });

    // Playerをちゃんと使っていないので一旦コメントアウト
    // const { reset: resetAudioPlayer, play: playAudio, stop: stopAudioPlayer } = useAudioPlayer();
    const { start: startAudioRecording, stop: stopAudioRecording } = useAudioRecorder();

    const onToggleListening = async () => {
        if (!isRecording) {
            const track = await startAudioRecording();
            if (!track) {
                console.error("Failed to start audio recording");
                return;
            }
            // resetAudioPlayer();
            // startSession(track, playAudio);
            startSession(track, () => {});
        } else {
            await stopAudioRecording();
            // stopAudioPlayer();
            inputAudioBufferClear();

            setIsRecording(false);
        }
    };

    const { t } = useTranslation();

    return (
        <div className="flex min-h-screen flex-col bg-gray-100 text-gray-900">
            <div className="p-4 sm:absolute sm:left-4 sm:top-4">
                <img src={logo} alt="Azure logo" className="h-16 w-16" />
            </div>
            <main className="flex flex-grow flex-col items-center justify-center">
                <h1 className="mb-8 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-4xl font-bold text-transparent md:text-7xl">
                    {t("app.title")}
                </h1>
                <div className="mb-4 flex flex-col items-center justify-center">
                    <Button
                        onClick={onToggleListening}
                        className={`h-12 w-60 ${isRecording ? "bg-red-600 hover:bg-red-700" : "bg-purple-500 hover:bg-purple-600"}`}
                        aria-label={isRecording ? t("app.stopRecording") : t("app.startRecording")}
                    >
                        {isRecording ? (
                            <>
                                <MicOff className="mr-2 h-4 w-4" />
                                {t("app.stopConversation")}
                            </>
                        ) : (
                            <>
                                <Mic className="mr-2 h-6 w-6" />
                            </>
                        )}
                    </Button>
                    <StatusMessage isRecording={isRecording} />
                </div>
                <GroundingFiles files={groundingFiles} onSelected={setSelectedFile} />
            </main>

            <footer className="py-4 text-center">
                <p>{t("app.footer")}</p>
            </footer>

            {/* 会話履歴 */}
            <div className="fixed right-0 top-0 flex h-screen w-96 flex-col overflow-hidden border-l border-gray-200 bg-white p-4">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">会話履歴</h2>
                    <Button
                        onClick={clearChatlogs}
                        variant="outline"
                        size="sm"
                        disabled={isRecording}
                        className="rounded-full bg-white text-black hover:bg-gray-100 disabled:opacity-50"
                    >
                        clear
                    </Button>
                </div>
                <div className="flex-grow overflow-y-auto">
                    {chatLogs.map(log => (
                        <div key={log.id} className={`mb-4 ${log.type === "user" ? "text-right" : "text-left"}`}>
                            <div
                                className={`inline-block max-w-[80%] rounded-lg px-4 py-2 ${
                                    log.type === "user" ? "bg-purple-500 text-white" : "bg-gray-100 text-gray-900"
                                }`}
                            >
                                {log.content}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <GroundingFileView groundingFile={selectedFile} onClosed={() => setSelectedFile(null)} />
        </div>
    );
}

export default App;
