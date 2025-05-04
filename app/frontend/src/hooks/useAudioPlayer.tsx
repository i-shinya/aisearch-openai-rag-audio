import { useRef } from "react";

export default function useAudioPlayer() {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const reset = () => {
        audioRef.current = new Audio();
    };

    const play = (stream: MediaStream) => {
        // NOTE: この方法だと音声が流れる
        // const audio = new Audio();
        // audio.srcObject = stream;
        // audio.play();

        // FIXME: この方法だと音声が流れない・・・原因が良く分からないのであとで調査する
        if (audioRef.current) {
            audioRef.current.srcObject = stream;
            audioRef.current.play().catch(error => console.error("Play error:", error));
        }
    };

    const stop = () => {
        if (audioRef.current) {
            audioRef.current.pause();
        }
    };

    return { reset, play, stop };
}
