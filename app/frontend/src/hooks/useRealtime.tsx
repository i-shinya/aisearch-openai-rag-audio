import {
    Message,
    ResponseAudioDelta,
    ResponseAudioTranscriptDelta,
    ResponseDone,
    ExtensionMiddleTierToolResponse,
    ResponseInputAudioTranscriptionCompleted,
    ChatLog
} from "@/types";
import { useEffect, useRef, useState } from "react";

type Parameters = {
    useDirectAoaiApi?: boolean; // If true, the middle tier will be skipped and the AOAI ws API will be called directly
    aoaiEndpointOverride?: string;
    aoaiApiKeyOverride?: string;
    aoaiModelOverride?: string;

    enableInputAudioTranscription?: boolean;
    onWebSocketOpen?: () => void;
    onWebSocketClose?: () => void;
    onWebSocketError?: (event: Event) => void;
    onWebSocketMessage?: (event: MessageEvent<any>) => void;

    onDataChannelOpened?: () => void;
    onReceivedResponseAudioDelta?: (message: ResponseAudioDelta) => void;
    onReceivedInputAudioBufferSpeechStarted?: (message: Message) => void;
    onReceivedResponseDone?: (message: ResponseDone) => void;
    onReceivedExtensionMiddleTierToolResponse?: (message: ExtensionMiddleTierToolResponse) => void;
    onReceivedResponseAudioTranscriptDelta?: (message: ResponseAudioTranscriptDelta) => void;
    onReceivedInputAudioTranscriptionCompleted?: (message: ResponseInputAudioTranscriptionCompleted) => void;
    onReceivedError?: (message: Message) => void;
};

export default function useRealTime({
    onDataChannelOpened,
    onReceivedResponseDone,
    onReceivedResponseAudioTranscriptDelta,
    onReceivedInputAudioBufferSpeechStarted,
    onReceivedExtensionMiddleTierToolResponse,
    onReceivedError
}: Parameters) {
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const peerConnection = useRef<RTCPeerConnection | null>(null);
    const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);

    const startSession = async (audioTrack: MediaStreamTrack, _: (stream: MediaStream) => void) => {
        const tokenResponse = await fetch("/session");
        const data = await tokenResponse.json();
        const EPHEMERAL_KEY = data.key;

        const pc = new RTCPeerConnection();
        pc.addTrack(audioTrack); // 音声入力
        pc.ontrack = event => {
            console.log("ontrack");
            // 音声出力（雑だが・・・）
            const [stream] = event.streams;
            const audio = new Audio();
            audio.srcObject = stream;
            audio.play();
        };

        const dc = pc.createDataChannel("oai-events");
        dc.onmessage = handleMessage;
        dataChannelRef.current = dc;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const baseUrl = "https://api.openai.com/v1/realtime";
        const model = "gpt-4o-realtime-preview-2024-12-17";
        const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
            method: "POST",
            body: offer.sdp,
            headers: {
                Authorization: `Bearer ${EPHEMERAL_KEY}`,
                "Content-Type": "application/sdp"
            }
        });

        const answer: RTCSessionDescriptionInit = {
            type: "answer" as RTCSdpType,
            sdp: await sdpResponse.text()
        };
        await pc.setRemoteDescription(answer);

        peerConnection.current = pc;
    };

    useEffect(() => {
        if (dataChannelRef.current) {
            dataChannelRef.current.addEventListener("message", e => {
                handleMessage(e);
            });

            dataChannelRef.current.addEventListener("open", () => {
                console.log("dataChannel opened");
                onDataChannelOpened?.();
            });
        }
    }, [dataChannelRef.current]);

    const handleMessage = async (event: MessageEvent) => {
        const message = JSON.parse(event.data);
        console.log("message", message);
        switch (message.type) {
            case "session.created":
            case "response.function_call_arguments.delta":
            case "response.function_call_arguments.done":
            case "response.output_item.added":
                break;
            case "conversation.item.created":
                if (message.item?.type === "function_call") {
                    console.log("function_call", message.item);
                    return;
                } else if (message.item?.type === "function_call_output") {
                    console.log("function_call_output", message.item);
                    return;
                }
                break;
            case "response.output_item.done":
                if (message.item?.type === "function_call") {
                    await handleFunctionCallResult(message.item);
                    dataChannelRef.current?.send(
                        JSON.stringify({
                            type: "response.create"
                        })
                    );
                    return;
                }
                break;
            case "response.done":
                if (message.response?.output) {
                    message.response.output = message.response.output.filter((output: { type: string }) => output.type !== "function_call");
                }
                onReceivedResponseDone?.(message);
                break;
            case "response.audio.delta":
                // web RTCだと音声はデータチャネルではなく、RTCPeerConnectionのイベントで取得されるのでここには入ってこない
                // onReceivedResponseAudioDelta?.(message as ResponseAudioDelta);
                break;
            case "response.audio_transcript.delta":
                onReceivedResponseAudioTranscriptDelta?.(message);
                break;
            case "input_audio_buffer.speech_started":
                onReceivedInputAudioBufferSpeechStarted?.(message);
                break;
            case "conversation.item.input_audio_transcription.completed":
                // 文字起こしされた入力音声はここに入ってくる
                setChatLogs(prev => [
                    ...prev,
                    {
                        id: message.item_id,
                        type: "user",
                        content: message.transcript
                    }
                ]);
                break;
            case "response.audio_transcript.done":
                // 音声のテキスト版が入ってる
                setChatLogs(prev => [
                    ...prev,
                    {
                        id: message.item_id,
                        type: "assistant",
                        content: message.transcript
                    }
                ]);
                break;
            case "extension.middle_tier_tool_response":
                // これはrealtime apiのeventではなくツール実行結果を送信するためバックエンドから送信されるevent
                onReceivedExtensionMiddleTierToolResponse?.(message);
                break;
            case "error":
                onReceivedError?.(message);
                break;
            default:
                // 以下はここに入ってきてる
                // response.content_part.done
                break;
        }
    };

    const handleFunctionCallResult = async (item: any) => {
        if (item.name === "search") {
            console.log("search tools", item);
            const { search_word } = JSON.parse(item.arguments);
            const searchResult = await fetch(`/search?query=${encodeURIComponent(search_word)}`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json"
                }
            });
            const resultJson = await searchResult.json();
            console.log("resultJson", resultJson);
            // web RTCでツール実行結果を送信
            const event = {
                type: "conversation.item.create",
                item: {
                    type: "function_call_output",
                    call_id: item.call_id,
                    output: JSON.stringify(resultJson)
                }
            };
            dataChannelRef.current?.send(JSON.stringify(event));
        }
        return null;
    };

    const clearChatlogs = () => {
        setChatLogs([]);
    };

    const inputAudioBufferClear = () => {
        // データチャネルのクローズ
        if (dataChannelRef.current) {
            dataChannelRef.current.close();
            dataChannelRef.current = null;
        }

        if (peerConnection.current) {
            // トラックの停止
            peerConnection.current.getSenders().forEach(sender => {
                if (sender.track) {
                    sender.track.stop();
                }
            });
            // コネクションのクローズ
            peerConnection.current.close();
            peerConnection.current = null;
        }
    };

    return { startSession, inputAudioBufferClear, chatLogs, clearChatlogs };
}
