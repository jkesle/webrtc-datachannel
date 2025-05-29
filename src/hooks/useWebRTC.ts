import { useEffect, useRef, useState } from 'react';

type PairedMessage = { type: 'paired'; initiator: boolean};
type OfferMessage = { type: 'offer'; offer: RTCSessionDescriptionInit };
type AnswerMessage = { type: 'answer'; answer: RTCSessionDescriptionInit };
type IceCandidateMessage = { type: 'ice-candidate'; candidate: RTCIceCandidateInit };
type WaitingMessage = { type: 'waiting' };
type PingMessage = { type: 'ping' };
type PongMessage = { type: 'pong' };

type SignalMessage = 
    | WaitingMessage
    | PairedMessage
    | OfferMessage
    | AnswerMessage
    | IceCandidateMessage
    | PingMessage
    | PongMessage

// function isSignalingMessage(object: any): object is SignalMessage {
//     if (typeof object !== 'object' || object == null) return false;
//     switch (object.type) {
//         case 'paired':
//             return typeof object.initiator === 'boolean';
//         case 'offer':
//             return typeof object.offer == 'object'
//                 && typeof object.offer.type === 'string'
//                 && typeof (object.offer?.sdp ?? '') === 'string';
//         case 'answer':
//             return typeof object.answer === 'object'
//                 && typeof object.answer.type === 'string'
//                 && object.answer.type === 'answer'
//                 && (object.answer?.sdp ?? '') === 'string';
//         case 'ice-candidate':
//             console.log(object.candidate);
//             return typeof object.candidate === 'object' || typeof object.candidate === 'string';
//         default:
//             return object.type === 'waiting' 
//                 || object.type === 'ping' 
//                 || object.type === 'pong';
//     }
// }

export default function useWebRTC(onData: (data: ArrayBuffer) => void, signalServerUrl: string = import.meta.env.VITE_WSS_URL) {
    const [paired, setPaired] = useState(false);
    const [waiting, setWaiting] = useState(false);
    const peerConnection = useRef<RTCPeerConnection | null>(null);
    const dataChannel = useRef<RTCDataChannel | null>(null);

    useEffect(() => {
        const socket = new WebSocket(signalServerUrl);
        const pendingCandidates: RTCIceCandidateInit[] = [];

        const sendJson = (message: any) => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify(message));
            }
        }

        socket.onopen = () => console.log("WebSocket connected to signal server");
        socket.onerror = (err) => console.error("General WebSocket fault.", err);
        socket.onmessage = async (event: MessageEvent) => {
            let parsed: any;
            try {
                parsed = JSON.parse(event.data);
            } catch (err) {
                console.error("Failed to parse a valid singaling message", err);
                return;
            }

            if (!parsed.type && parsed.candidate) {
                parsed = { type: 'ice-candidate', candidate: parsed };
            }

            const message = parsed as SignalMessage;
            switch (message.type) {
                case 'waiting':
                    console.log("Waiting message recieved");
                    console.info("You have been placed in the wait queue");
                    setWaiting(true);
                    break;
                case 'paired': {
                    if (waiting) { setWaiting(false) }
                    setPaired(true);
                    const { initiator } = message;
                    const pc = peerConnection.current = new RTCPeerConnection();

                    pc.onicecandidate = event => {
                        if (event.candidate) sendJson({ type: "ice-candidate", candidate: event.candidate });
                    };

                    if (initiator) {
                        const channel = dataChannel.current = pc.createDataChannel('sync-channel');
                        channel.binaryType = 'arraybuffer';
                        channel.onmessage = (event) => {
                            if (event.data instanceof ArrayBuffer) onData(event.data);
                        };
                        channel.onopen = () => console.log("Sync data channel open for local client")
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        sendJson({ type: 'offer', offer });
                    } else {
                        pc.ondatachannel = (event) => {
                            const channel = event.channel;
                            dataChannel.current = channel;
                            channel.binaryType = 'arraybuffer';
                            channel.onmessage = event => {
                                if (event.data instanceof ArrayBuffer) onData(event.data);
                            };

                            channel.onopen = () => console.log("Sync data channel open for remote client");
                        };
                    }

                    break;
                };

                case 'offer': {
                    const pc = peerConnection.current!;
                    await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
                    pendingCandidates.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error));
                    pendingCandidates.length = 0;
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    sendJson({ type: "answer", answer });
                    break;
                };

                case 'answer': {
                    await peerConnection.current?.setRemoteDescription(new RTCSessionDescription(message.answer));
                    pendingCandidates.forEach(c => peerConnection.current!.addIceCandidate(new RTCIceCandidate(c)).catch(console.error));
                    break;
                };

                case 'ice-candidate': {
                    const pc = peerConnection.current;
                    if (!pc) return;
                    if (!pc.remoteDescription) {
                        pendingCandidates.push(message.candidate);
                    } else {
                        try {
                            await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
                        } catch (err) {
                            console.error("Error occurred while adding ICE candidate", err);
                        }
                    }

                    break;
                };
            };
        };

        return () => {
            socket.close();
            peerConnection.current?.close();
        };
    }, [signalServerUrl, onData]);

    return { waiting, paired, sendBytes: (buffer: ArrayBuffer) => {
        const channel = dataChannel.current;
        if (channel?.readyState === 'open') channel.send(buffer);
    } };
};