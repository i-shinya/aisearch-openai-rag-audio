import { useRef } from "react";

export default function useAudioRecorder() {
    const audioRecorder = useRef<MediaStream>();

    const start = async () => {
        if (audioRecorder.current) {
            return audioRecorder.current.getTracks()[0];
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioRecorder.current = stream;
        return stream.getTracks()[0];
    };

    const stop = async () => {
        if (audioRecorder.current) {
            audioRecorder.current.getTracks().forEach(track => track.stop());
            audioRecorder.current = undefined;
        }
    };

    return { start, stop };
}
