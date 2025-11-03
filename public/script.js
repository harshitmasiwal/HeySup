// ============================
// HeySup - Random Video Chat
// ============================

// DOM Elements
const landingPage = document.getElementById('landing');
const chatRoom = document.getElementById('chatRoom');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startChatBtn = document.getElementById('startChatBtn');
const nextBtn = document.getElementById('nextBtn');
const endBtn = document.getElementById('endBtn');
const cameraBtn = document.getElementById('cameraBtn');
const micBtn = document.getElementById('micBtn');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesDiv = document.getElementById('messages');
const connectingOverlay = document.getElementById('connectingOverlay');

// WebRTC Variables
let localStream = null;
let pc = null;
let isSearching = false;
let currentPeerId = null;

// Replace with your deployed Render server URL 👇
const socket = io("https://heysup-3f8q.onrender.com", {
  transports: ["websocket", "polling"],
});

// Twilio ICE servers configuration
const iceServers = [
  { urls: 'stun:global.stun.twilio.com:3478' },
  { 
    urls: 'turn:global.turn.twilio.com:3478?transport=udp',
    username: '5ea6d696748f1875872562aa6e0b7e534240e3662dab9d48099202ef0f19713a',  
    credential: 'nq/DSit0QUiCf9r/O1reHvMHlwC9BBrOXsOJEoLV/ak=' 
  }
];

// Socket event listeners
socket.on('matched', handleMatch);
socket.on('offer', handleIncomingOffer);
socket.on('answer', handleAnswer);
socket.on('candidate', handleCandidate);
socket.on('chat-message', handleChatMessage);
socket.on('peer-left', handlePeerLeft);

// ============================
// Main Functions
// ============================

// Start camera and microphone
async function initializeApp() {
  try {
    if (location.protocol !== "https:") {
      alert("Please open this site with HTTPS for camera/mic access!");
      return;
    }

    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 },
      audio: true
    });

    localVideo.srcObject = localStream;
    localVideo.muted = true;
    await localVideo.play().catch(() => {});

    chatRoom.classList.remove('hidden');
    landingPage.classList.add('hidden');
    startSearching();

  } catch (err) {
    console.error("Camera error:", err);
    alert("Could not access camera/microphone. Please check permissions.");
  }
}

// Start searching for a peer
function startSearching() {
  if (pc) {
    pc.close();
    pc = null;
  }
  remoteVideo.srcObject = null;
  currentPeerId = null;
  connectingOverlay.style.display = 'flex';
  isSearching = true;
  socket.emit('find-match');
}

// Handle match found
function handleMatch(peerId) {
  currentPeerId = peerId;
  isSearching = false;

  pc = new RTCPeerConnection({ iceServers });

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  pc.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
    connectingOverlay.style.display = 'none';
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('candidate', { candidate, peerId: currentPeerId });
  };

  // Initiator creates offer
  if (peerId > socket.id) {
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        socket.emit('offer', { offer: pc.localDescription, peerId: currentPeerId });
      })
      .catch(err => console.error("Offer error:", err));
  }
}

// Handle incoming offer
async function handleIncomingOffer({ offer, peerId }) {
  currentPeerId = peerId;

  if (!pc) {
    pc = new RTCPeerConnection({ iceServers });

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.ontrack = event => {
      remoteVideo.srcObject = event.streams[0];
      connectingOverlay.style.display = 'none';
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('candidate', { candidate, peerId: currentPeerId });
    };
  }

  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', { answer, peerId: currentPeerId });
}

// Handle answer to our offer
async function handleAnswer({ answer, peerId }) {
  if (peerId === currentPeerId && pc) {
    await pc.setRemoteDescription(answer);
  }
}

// Handle ICE candidate
function handleCandidate({ candidate, peerId }) {
  if (peerId === currentPeerId && pc) {
    pc.addIceCandidate(candidate);
  }
}

// Handle chat messages
function handleChatMessage(message) {
  addMessageToChat(message, false);
}

// Handle peer leaving
function handlePeerLeft() {
  if (pc) {
    pc.close();
    pc = null;
  }
  remoteVideo.srcObject = null;
  connectingOverlay.style.display = 'flex';
  startSearching();
}

// Add message to chat
function addMessageToChat(message, isSent) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
  messageDiv.textContent = message;
  messagesDiv.appendChild(messageDiv);
  setTimeout(() => {
    messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });
  }, 100);
}

// ============================
// UI Event Listeners
// ============================
startChatBtn.onclick = initializeApp;

nextBtn.onclick = () => {
  if (pc) {
    pc.close();
    pc = null;
  }
  socket.emit('leave-chat');
  startSearching();
};

endBtn.onclick = () => {
  if (pc) {
    pc.close();
    pc = null;
  }
  socket.emit('leave-chat');
  landingPage.classList.remove('hidden');
  chatRoom.classList.add('hidden');
  messagesDiv.innerHTML = '';
};

// Camera toggle
cameraBtn.onclick = () => {
  const videoTrack = localStream.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;
  cameraBtn.innerHTML = videoTrack.enabled ? 
    '<i class="fas fa-video"></i>' : 
    '<i class="fas fa-video-slash"></i>';
};

// Mic toggle
micBtn.onclick = () => {
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  micBtn.innerHTML = audioTrack.enabled ? 
    '<i class="fas fa-microphone"></i>' : 
    '<i class="fas fa-microphone-slash"></i>';
};

// Send message
sendBtn.onclick = () => {
  const message = messageInput.value.trim();
  if (message && currentPeerId) {
    socket.emit('chat-message', { message, peerId: currentPeerId });
    addMessageToChat(message, true);
    messageInput.value = '';
  }
};

messageInput.onkeypress = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
};

// Disconnect cleanly when user leaves page
window.onbeforeunload = () => {
  socket.disconnect();
  if (pc) pc.close();
};
