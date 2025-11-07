
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

let localStream = null;
let pc = null;
let isSearching = false;
let currentPeerId = null;

let dynamicIceServers = null;

async function getIceServers() {
  try {
    // fetch from same server (no need for localhost:5000 if same domain)
    const response = await fetch('/turn-credentials');
    const iceServers = await response.json();
    console.log("Fetched ICE servers:", iceServers);
    dynamicIceServers = iceServers;
    return iceServers;
  } catch (err) {
    console.error("Failed to fetch TURN credentials, using fallback STUN:", err);
    // fallback to basic STUN if fetch fails
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}


const socket = io.connect(window.location.origin);


socket.on('matched', handleMatch);
socket.on('offer', handleIncomingOffer);
socket.on('answer', handleAnswer);
socket.on('candidate', handleCandidate);
socket.on('chat-message', handleChatMessage);
socket.on('peer-left', handlePeerLeft);

async function initializeApp() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    localVideo.srcObject = localStream;

    chatRoom.classList.remove('hidden');
    landingPage.classList.add('hidden');
    document.body.style.overflow = 'hidden';

    setInitialLayout();
    startSearching();
  } catch (err) {
    console.error("Camera/microphone error:", err);
    alert("Could not access camera or microphone. Please check permissions and try again.");
  }
}

function startSearching() {
  if (pc) {
    try {
      pc.close();
    } catch (e) {
      console.error('Error closing peer connection:', e);
    }
    pc = null;
  }

  remoteVideo.srcObject = null;
  currentPeerId = null;
  connectingOverlay.style.display = 'flex';
  isSearching = true;
  socket.emit('find-match');
}

async function handleMatch(peerId) {
  currentPeerId = peerId;
  isSearching = false;

  const iceServers = dynamicIceServers || await getIceServers();
  pc = new RTCPeerConnection({ iceServers });

  if (localStream) {
    localStream.getTracks().forEach(track => {
      try {
        pc.addTrack(track, localStream);
      } catch (e) {
        console.error('Error adding track:', e);
      }
    });
  }

  pc.ontrack = event => {
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      connectingOverlay.style.display = 'none';
      setInitialLayout();
    }
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('candidate', { candidate, peerId: currentPeerId });
    }
  };

  if (peerId > socket.id) {
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        socket.emit('offer', { offer: pc.localDescription, peerId: currentPeerId });
      })
      .catch(err => console.error("Offer error:", err));
  }
}

async function handleIncomingOffer({ offer, peerId }) {
  currentPeerId = peerId;

  if (!pc) {
    const iceServers = dynamicIceServers || await getIceServers();
    pc = new RTCPeerConnection({ iceServers });


    if (localStream) {
      localStream.getTracks().forEach(track => {
        try {
          pc.addTrack(track, localStream);
        } catch (e) {
          console.error('Error adding track:', e);
        }
      });
    }

    pc.ontrack = event => {
      if (event.streams && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
        connectingOverlay.style.display = 'none';
        setInitialLayout();
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        socket.emit('candidate', { candidate, peerId: currentPeerId });
      }
    };
  }

  try {
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { answer, peerId: currentPeerId });
  } catch (err) {
    console.error("handleIncomingOffer error:", err);
  }
}

async function handleAnswer({ answer, peerId }) {
  if (peerId === currentPeerId && pc) {
    try {
      await pc.setRemoteDescription(answer);
    } catch (e) {
      console.error('Error setting remote description:', e);
    }
  }
}

function handleCandidate({ candidate, peerId }) {
  if (peerId === currentPeerId && pc) {
    try {
      pc.addIceCandidate(candidate);
    } catch (e) {
      console.warn("addIceCandidate error", e);
    }
  }
}

function handleChatMessage(message) {
  addMessageToChat(message, false);
}

function handlePeerLeft() {
  addSystemMessage('Stranger disconnected');
  startSearching();
}

function addMessageToChat(message, isSent) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
  messageDiv.textContent = message;
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(text) {
  const messageDiv = document.createElement('div');
  messageDiv.style.textAlign = 'center';
  messageDiv.style.color = '#64748b';
  messageDiv.style.fontSize = '0.85rem';
  messageDiv.style.padding = '8px';
  messageDiv.textContent = text;
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

startChatBtn.onclick = initializeApp;
nextBtn.onclick = () => {
  messagesDiv.innerHTML = '';
  startSearching();
};

endBtn.onclick = () => {
  if (pc) {
    try { pc.close(); } catch (e) {}
    pc = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  socket.emit('leave-chat');
  landingPage.classList.remove('hidden');
  chatRoom.classList.add('hidden');
  messagesDiv.innerHTML = '';
  document.body.style.overflow = '';
};

cameraBtn.onclick = () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;

  videoTrack.enabled = !videoTrack.enabled;
  cameraBtn.innerHTML = videoTrack.enabled ?
    '<i class="fas fa-video"></i>' :
    '<i class="fas fa-video-slash"></i>';

  if (!videoTrack.enabled) {
    cameraBtn.style.background = 'rgba(239, 68, 68, 0.3)';
    cameraBtn.style.borderColor = '#ef4444';
  } else {
    cameraBtn.style.background = '';
    cameraBtn.style.borderColor = '';
  }
};

micBtn.onclick = () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;

  audioTrack.enabled = !audioTrack.enabled;
  micBtn.innerHTML = audioTrack.enabled ?
    '<i class="fas fa-microphone"></i>' :
    '<i class="fas fa-microphone-slash"></i>';

  if (!audioTrack.enabled) {
    micBtn.style.background = 'rgba(239, 68, 68, 0.3)';
    micBtn.style.borderColor = '#ef4444';
  } else {
    micBtn.style.background = '';
    micBtn.style.borderColor = '';
  }
};

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

window.onbeforeunload = () => {
  try {
    socket.disconnect();
  } catch (e) {}

  if (pc) {
    try { pc.close(); } catch (e) {}
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
};

let isLocalBig = false;

function setInitialLayout() {
  if (window.innerWidth > 1200) {
    localVideo.parentElement.classList.remove('small');
    remoteVideo.parentElement.classList.remove('small');
    return;
  }

  isLocalBig = false;
  localVideo.parentElement.classList.add('small');
  remoteVideo.parentElement.classList.remove('small');
}

function swapVideos() {
  if (window.innerWidth > 1200) return;

  isLocalBig = !isLocalBig;

  if (isLocalBig) {
    localVideo.parentElement.classList.remove('small');
    remoteVideo.parentElement.classList.add('small');
  } else {
    remoteVideo.parentElement.classList.remove('small');
    localVideo.parentElement.classList.add('small');
  }
}

if (localVideo) localVideo.addEventListener('click', swapVideos);
if (remoteVideo) remoteVideo.addEventListener('click', swapVideos);

let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(setInitialLayout, 150);
});

document.addEventListener('DOMContentLoaded', () => {
  setInitialLayout();
});
