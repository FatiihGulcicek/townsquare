import Vue from "vue";

/*
 * Voice chat between players (WebRTC, every phone connects to every other).
 * The server decides who may hear whom in each phase (night: only vampires
 * hear each other; the dead only hear the dead). The rule is enforced by the
 * speaker's own phone: it simply does not send its microphone to anyone who
 * is not allowed to hear it.
 */
export const voiceChat = Vue.observable({
  on: false,
  joining: false,
  muted: false,
  error: "",
  speaking: {}, // pid -> true while talking
  connected: {}, // pid -> true when the audio link works
});

let send = () => {};
let localStream = null;
let localTrack = null;
let iceServers = null;
let myPid = null;
let lastPolicy = { peers: [], sendTo: [], hearFrom: [] };
const peers = new Map(); // pid -> { pc, sender, audio, analyser, initiator }
let audioCtx = null;
let meterTimer = null;

export function bindVoice(sendFn) {
  send = sendFn;
}

async function loadIce() {
  if (iceServers) return iceServers;
  try {
    const response = await fetch("/api/ice", { cache: "no-store" });
    iceServers = (await response.json()).iceServers;
  } catch (e) {
    iceServers = [{ urls: ["stun:stun.l.google.com:19302"] }];
  }
  return iceServers;
}

function context() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function meter(stream) {
  const ctx = context();
  if (!ctx) return null;
  try {
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    return { analyser, data: new Uint8Array(analyser.fftSize) };
  } catch (e) {
    return null;
  }
}

function level(m) {
  if (!m) return 0;
  m.analyser.getByteTimeDomainData(m.data);
  let sum = 0;
  for (let i = 0; i < m.data.length; i++) {
    const v = (m.data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / m.data.length);
}

let localMeter = null;
function startMeters() {
  clearInterval(meterTimer);
  meterTimer = setInterval(() => {
    const speaking = {};
    if (myPid && localMeter && !voiceChat.muted && level(localMeter) > 0.04) {
      speaking[myPid] = true;
    }
    peers.forEach((peer, pid) => {
      if (peer.meter && level(peer.meter) > 0.04) speaking[pid] = true;
    });
    voiceChat.speaking = speaking;
  }, 250);
}

/** join the voice chat (must run from a tap: microphone + audio unlock) */
export async function joinVoice() {
  if (voiceChat.on || voiceChat.joining) return;
  voiceChat.joining = true;
  voiceChat.error = "";
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
    localTrack = localStream.getAudioTracks()[0];
    localMeter = meter(localStream);
    await loadIce();
    context();
    voiceChat.on = true;
    voiceChat.muted = false;
    startMeters();
    send("voice", true);
  } catch (e) {
    voiceChat.error =
      e && e.name === "NotAllowedError"
        ? "Mikrofon izni verilmedi. Telefonun ayarlarından izin ver."
        : "Mikrofon açılamadı.";
    stopLocal();
  }
  voiceChat.joining = false;
}

function stopLocal() {
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
  localStream = null;
  localTrack = null;
  localMeter = null;
}

export function leaveVoice() {
  send("voice", false);
  peers.forEach((_, pid) => closePeer(pid));
  stopLocal();
  clearInterval(meterTimer);
  voiceChat.on = false;
  voiceChat.speaking = {};
  voiceChat.connected = {};
}

export function toggleMute() {
  voiceChat.muted = !voiceChat.muted;
  applyPolicy();
}

function closePeer(pid) {
  const peer = peers.get(pid);
  if (!peer) return;
  try {
    peer.pc.close();
  } catch (e) {
    // ignore
  }
  if (peer.audio) {
    peer.audio.srcObject = null;
    peer.audio.remove();
  }
  peers.delete(pid);
  Vue.delete(voiceChat.connected, pid);
}

function createPeer(pid) {
  const initiator = myPid < pid;
  const pc = new RTCPeerConnection({ iceServers });
  const transceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
  const peer = {
    pc,
    sender: transceiver.sender,
    initiator,
    audio: null,
    meter: null,
  };
  peers.set(pid, peer);
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      send("rtc", { to: pid, data: { candidate: event.candidate } });
    }
  };
  pc.ontrack = (event) => {
    const stream = event.streams[0] || new MediaStream([event.track]);
    if (!peer.audio) {
      peer.audio = document.createElement("audio");
      peer.audio.autoplay = true;
      peer.audio.setAttribute("playsinline", "");
      document.body.appendChild(peer.audio);
    }
    peer.audio.srcObject = stream;
    peer.audio.play().catch(() => {});
    peer.meter = meter(stream);
  };
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState;
    if (state === "connected") Vue.set(voiceChat.connected, pid, true);
    if (state === "failed" || state === "closed") {
      Vue.delete(voiceChat.connected, pid);
      if (state === "failed" && voiceChat.on) {
        // try again from scratch
        closePeer(pid);
        setTimeout(() => sync(lastPolicy), 2000);
      }
    }
  };
  if (initiator) {
    pc.onnegotiationneeded = async () => {
      try {
        await pc.setLocalDescription(await pc.createOffer());
        send("rtc", { to: pid, data: { sdp: pc.localDescription } });
      } catch (e) {
        // ignore
      }
    };
  }
  applyPeer(pid, peer);
  return peer;
}

function applyPeer(pid, peer) {
  const allowed = lastPolicy.sendTo.includes(pid) && !voiceChat.muted;
  const track = allowed ? localTrack : null;
  if (peer.sender.track !== track) {
    peer.sender.replaceTrack(track).catch(() => {});
  }
  if (peer.audio) peer.audio.muted = !lastPolicy.hearFrom.includes(pid);
}

function applyPolicy() {
  peers.forEach((peer, pid) => applyPeer(pid, peer));
}

/** keep connections in line with the server's view of the voice chat */
function sync(policy) {
  if (!voiceChat.on || !myPid) return;
  const wanted = new Set(policy.peers);
  peers.forEach((_, pid) => {
    if (!wanted.has(pid)) closePeer(pid);
  });
  wanted.forEach((pid) => {
    if (!peers.has(pid)) createPeer(pid);
  });
  applyPolicy();
}

/** called with every game state */
export function voiceState(voice) {
  if (!voice) return;
  myPid = voice.me;
  lastPolicy = voice;
  if (voiceChat.on && !voice.on) {
    // the server forgot us (reconnect): join again
    send("voice", true);
    return;
  }
  sync(voice);
}

/** WebRTC signalling message from another player */
export async function voiceSignal({ from, data }) {
  if (!voiceChat.on || !data) return;
  let peer = peers.get(from);
  if (!peer) peer = createPeer(from);
  const pc = peer.pc;
  try {
    if (data.sdp) {
      if (data.sdp.type === "offer") {
        if (pc.signalingState !== "stable") {
          await pc.setLocalDescription({ type: "rollback" }).catch(() => {});
        }
        await pc.setRemoteDescription(data.sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        send("rtc", { to: from, data: { sdp: pc.localDescription } });
        applyPeer(from, peer);
      } else if (data.sdp.type === "answer") {
        await pc.setRemoteDescription(data.sdp);
      }
    } else if (data.candidate) {
      await pc.addIceCandidate(data.candidate).catch(() => {});
    }
  } catch (e) {
    // a broken negotiation is retried when the connection fails
  }
}

/** after the socket reconnects every link is rebuilt */
export function voiceReconnected() {
  if (!voiceChat.on) return;
  peers.forEach((_, pid) => closePeer(pid));
  send("voice", true);
}
