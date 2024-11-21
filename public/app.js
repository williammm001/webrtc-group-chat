const socket = io();
let localStream;
let peerConnection;
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

// STUN server configuration
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }, // Public STUN server
    ],
};

// Access user's webcam and microphone
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then((stream) => {
        localStream = stream;
        localVideo.srcObject = localStream;

        // Notify server that this user has joined
        socket.emit('join-room');
    })
    .catch(console.error);

// Handle incoming signaling messages
socket.on('offer', async ({ sdp, sender }) => {
    peerConnection = createPeerConnection(sender);
    await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit('answer', { target: sender, sdp: peerConnection.localDescription });
});

socket.on('answer', async ({ sdp }) => {
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
    }
});

socket.on('ice-candidate', ({ candidate }) => {
    if (peerConnection && candidate) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

// Notify when another user connects
socket.on('user-connected', (userId) => {
    peerConnection = createPeerConnection(userId);

    // Add local stream tracks to peer connection
    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
    });

    // Create and send an offer to the new peer
    peerConnection.createOffer()
        .then((offer) => {
            peerConnection.setLocalDescription(offer);
            socket.emit('offer', { target: userId, sdp: offer });
        })
        .catch(console.error);
});

socket.on('user-disconnected', () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
        remoteVideo.srcObject = null;
    }
});

// Create and configure a new RTCPeerConnection
function createPeerConnection(target) {
    const pc = new RTCPeerConnection(config);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { target, candidate: event.candidate });
        }
    };

    // Handle incoming remote streams
    pc.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    return pc;
}
