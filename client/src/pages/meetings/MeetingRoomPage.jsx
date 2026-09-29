import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { Button } from '../../components/common/Button.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  Users,
  AlertTriangle,
  Radio,
  CheckCircle2,
  XCircle,
  Camera,
  ArrowLeft,
  Play,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// Diagnostic loggers (development only)
const isDev = Boolean(import.meta.env?.DEV);
const logMedia = (...args) => isDev && console.log('[MEDIA]', ...args);
const logWebRTC = (...args) => isDev && console.log('[WEBRTC]', ...args);
const logIce = (...args) => isDev && console.log('[ICE]', ...args);
const logSignal = (...args) => isDev && console.log('[SIGNAL]', ...args);
const logVideo = (...args) => isDev && console.log('[VIDEO]', ...args);
const logAudio = (...args) => isDev && console.log('[AUDIO]', ...args);

export const MeetingRoomPage = () => {
  const { meetingId } = useParams();
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const navigate = useNavigate();

  const socketRef = useRef(socket);
  socketRef.current = socket;

  // Meeting metadata
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Call state: 'lobby' (pre-join preview) | 'joined' (in conference)
  const [callState, setCallState] = useState('lobby');

  // MediaStream state & Ref
  const [localStream, setLocalStream] = useState(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);

  // Device & Permission statuses: 'ready' | 'off' | 'blocked' | 'unsupported' | 'idle'
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [micStatus, setMicStatus] = useState('idle');
  const [mediaError, setMediaError] = useState('');
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  // In-call toggles
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  // Peer streams map: socketId -> { stream, name, userId, role }
  const [remotePeers, setRemotePeers] = useState({});

  // WebRTC Refs
  const peersRef = useRef({}); // socketId -> RTCPeerConnection
  const iceCandidatesQueueRef = useRef({}); // socketId -> [RTCIceCandidateInit]

  // Diagnostic state for on-screen debug panel
  const [showDiagPanel, setShowDiagPanel] = useState(false);
  const [diagInfo, setDiagInfo] = useState({
    secureContext: typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false,
    mediaDevicesAvailable: typeof navigator !== 'undefined' ? Boolean(navigator.mediaDevices?.getUserMedia) : false,
    localStreamActive: false,
    videoTrackCount: 0,
    audioTrackCount: 0,
    videoTrackEnabled: false,
    videoTrackState: 'none',
    audioTrackEnabled: false,
    audioTrackState: 'none',
    videoElementReadyState: 0,
    videoResolution: '0x0',
    videoPaused: true,
    socketConnected: isConnected,
    meetingJoined: false,
    peerCount: 0,
    peersStatus: {},
    remoteStreamCount: 0,
    videoInputs: 0,
    audioInputs: 0,
    permissionCamera: 'unknown',
    permissionMic: 'unknown',
  });

  const updateDiag = useCallback(() => {
    const stream = localStreamRef.current;
    const vTrack = stream?.getVideoTracks()[0];
    const aTrack = stream?.getAudioTracks()[0];
    const vidEl = localVideoRef.current;

    const peersStat = {};
    Object.keys(peersRef.current).forEach((sid) => {
      const pc = peersRef.current[sid];
      if (pc) {
        peersStat[sid] = {
          signalingState: pc.signalingState,
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          iceGatheringState: pc.iceGatheringState,
        };
      }
    });

    setDiagInfo((prev) => ({
      ...prev,
      secureContext: typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false,
      mediaDevicesAvailable: typeof navigator !== 'undefined' ? Boolean(navigator.mediaDevices?.getUserMedia) : false,
      localStreamActive: Boolean(stream && stream.active),
      videoTrackCount: stream ? stream.getVideoTracks().length : 0,
      audioTrackCount: stream ? stream.getAudioTracks().length : 0,
      videoTrackEnabled: Boolean(vTrack?.enabled),
      videoTrackState: vTrack?.readyState || 'none',
      audioTrackEnabled: Boolean(aTrack?.enabled),
      audioTrackState: aTrack?.readyState || 'none',
      videoElementReadyState: vidEl ? vidEl.readyState : 0,
      videoResolution: vidEl ? `${vidEl.videoWidth}x${vidEl.videoHeight}` : '0x0',
      videoPaused: vidEl ? vidEl.paused : true,
      socketConnected: Boolean(socketRef.current?.connected),
      meetingJoined: callState === 'joined',
      peerCount: Object.keys(peersRef.current).length,
      peersStatus: peersStat,
      remoteStreamCount: Object.keys(remotePeers).length,
    }));
  }, [callState, remotePeers]);

  // Initial Permission & Device Query
  useEffect(() => {
    const checkPermissionsAndDevices = async () => {
      if (navigator.permissions && navigator.permissions.query) {
        try {
          const camPerm = await navigator.permissions.query({ name: 'camera' });
          const micPerm = await navigator.permissions.query({ name: 'microphone' });
          setDiagInfo((prev) => ({
            ...prev,
            permissionCamera: camPerm.state,
            permissionMic: micPerm.state,
          }));
        } catch (e) {
          // Permissions API query not supported for camera/mic in some browsers
        }
      }

      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === 'videoinput').length;
          const audioInputs = devices.filter((d) => d.kind === 'audioinput').length;
          logMedia('Detected devices:', { videoInputs, audioInputs });
          setDiagInfo((prev) => ({
            ...prev,
            videoInputs,
            audioInputs,
          }));
        } catch (e) {
          logMedia('Device enumeration error:', e.message);
        }
      }
    };
    checkPermissionsAndDevices();
  }, []);

  // 1. Fetch meeting metadata
  const loadMeeting = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      logSignal('Fetching meeting metadata for:', meetingId);
      const res = await meetingsApi.getMeetingById(meetingId);
      const meetingData = res.data?.meeting;
      if (!meetingData) {
        throw new Error('Meeting not found.');
      }
      if (meetingData.status === 'ended') {
        throw new Error('This meeting has ended.');
      }
      setMeeting(meetingData);
      logSignal('Meeting metadata loaded successfully:', meetingData.title);
    } catch (err) {
      logSignal('Meeting fetch failed:', err.message);
      setError(err.message || 'Failed to load meeting details.');
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    loadMeeting();
  }, [loadMeeting]);

  // 2. Local Media Acquisition with Simple Constraints
  const acquireMedia = useCallback(async (options = { video: true, audio: true }) => {
    setMediaError('');
    setPlaybackBlocked(false);

    logMedia('Requesting getUserMedia with simple constraints:', JSON.stringify(options));
    logMedia('window.isSecureContext:', typeof window !== 'undefined' ? window.isSecureContext : 'unknown');
    logMedia('navigator.mediaDevices existence:', Boolean(navigator.mediaDevices));
    logMedia('navigator.mediaDevices.getUserMedia existence:', Boolean(navigator.mediaDevices?.getUserMedia));

    // Check secure context requirement (HTTPS or localhost)
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      const msg = 'Camera and microphone require HTTPS or localhost.';
      logMedia('[ERROR] Insecure context detected.');
      setMediaError(msg);
      setCameraStatus('unsupported');
      setMicStatus('unsupported');
      return null;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'WebRTC media devices are not supported by this browser.';
      logMedia('[ERROR] getUserMedia API missing.');
      setMediaError(msg);
      setCameraStatus('unsupported');
      setMicStatus('unsupported');
      return null;
    }

    try {
      // Use simple unconstrained request first as instructed
      const stream = await navigator.mediaDevices.getUserMedia({
        video: Boolean(options.video),
        audio: Boolean(options.audio),
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      logMedia('getUserMedia SUCCESS:', {
        streamId: stream.id,
        streamActive: stream.active,
        videoTrackCount: videoTracks.length,
        audioTrackCount: audioTracks.length,
      });

      if (videoTracks.length === 0) {
        if (options.video) {
          setMediaError('Camera permission was granted, but no video track was detected.');
          setCameraStatus('unsupported');
        } else {
          setCameraStatus('off');
        }
      } else {
        const vTrack = videoTracks[0];
        vTrack.enabled = true;
        setCameraStatus('ready');
        setIsVideoOff(false);

        logVideo('Video track inspected:', {
          kind: vTrack.kind,
          enabled: vTrack.enabled,
          muted: vTrack.muted,
          readyState: vTrack.readyState,
          label: vTrack.label || 'Standard Camera',
        });

        vTrack.onended = () => {
          logVideo('Video track ended unexpectedly');
          setCameraStatus('off');
          setIsVideoOff(true);
          updateDiag();
        };
      }

      if (audioTracks.length === 0) {
        if (options.audio) {
          setMicStatus('unsupported');
        } else {
          setMicStatus('off');
        }
      } else {
        const aTrack = audioTracks[0];
        aTrack.enabled = true;
        setMicStatus('ready');
        setIsMuted(false);

        logAudio('Audio track inspected:', {
          kind: aTrack.kind,
          enabled: aTrack.enabled,
          muted: aTrack.muted,
          readyState: aTrack.readyState,
          label: aTrack.label || 'Standard Microphone',
        });

        aTrack.onended = () => {
          logAudio('Audio track ended unexpectedly');
          setMicStatus('off');
          setIsMuted(true);
          updateDiag();
        };
      }

      updateDiag();
      return stream;
    } catch (err) {
      logMedia('[FAILURE] getUserMedia error:', { name: err.name, message: err.message });

      let userMsg = 'Unable to access media devices.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        userMsg = 'Camera or microphone permission was denied by browser settings.';
        setCameraStatus('blocked');
        setMicStatus('blocked');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        userMsg = 'No camera or microphone was detected on this device.';
        setCameraStatus('unsupported');
        setMicStatus('unsupported');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        userMsg = 'Camera or microphone is already in use by another application.';
        setCameraStatus('blocked');
        setMicStatus('blocked');
      } else if (err.name === 'OverconstrainedError') {
        userMsg = 'Requested camera/microphone constraints could not be satisfied.';
      }

      setMediaError(userMsg);
      updateDiag();
      return null;
    }
  }, [updateDiag]);

  // 3. Reliable Video Element Attachment & Event Monitoring
  // Separates DOM attachment lifecycle from MediaStream lifetime
  useEffect(() => {
    const videoEl = localVideoRef.current;
    if (!videoEl) return;

    const stream = localStreamRef.current;
    if (stream && stream.active) {
      logVideo('Binding local stream to <video> element', {
        streamId: stream.id,
        callState,
        tracks: stream.getTracks().map((t) => `${t.kind}:${t.readyState}:${t.enabled}`),
      });

      videoEl.srcObject = stream;

      const onLoadedMetadata = () => {
        logVideo('local <video> loadedmetadata:', {
          videoWidth: videoEl.videoWidth,
          videoHeight: videoEl.videoHeight,
          readyState: videoEl.readyState,
        });
        updateDiag();
      };

      const onCanPlay = () => {
        logVideo('local <video> canplay event fired');
        updateDiag();
      };

      const onPlaying = () => {
        logVideo('local <video> playing event fired');
        setPlaybackBlocked(false);
        updateDiag();
      };

      const onPause = () => {
        logVideo('local <video> paused');
        updateDiag();
      };

      const onError = (e) => {
        logVideo('local <video> error event:', e);
        updateDiag();
      };

      videoEl.addEventListener('loadedmetadata', onLoadedMetadata);
      videoEl.addEventListener('canplay', onCanPlay);
      videoEl.addEventListener('playing', onPlaying);
      videoEl.addEventListener('pause', onPause);
      videoEl.addEventListener('error', onError);

      const playPromise = videoEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise
          .then(() => {
            logVideo('local <video> play() resolved successfully');
            setPlaybackBlocked(false);
            updateDiag();
          })
          .catch((err) => {
            logVideo('local <video> play() rejected by browser policy:', err.name, err.message);
            setPlaybackBlocked(true);
            updateDiag();
          });
      }

      return () => {
        videoEl.removeEventListener('loadedmetadata', onLoadedMetadata);
        videoEl.removeEventListener('canplay', onCanPlay);
        videoEl.removeEventListener('playing', onPlaying);
        videoEl.removeEventListener('pause', onPause);
        videoEl.removeEventListener('error', onError);
        // Only detach srcObject from this element instance. DO NOT stop stream tracks here!
        videoEl.srcObject = null;
      };
    } else {
      videoEl.srcObject = null;
    }
  }, [localStream, callState, updateDiag]);

  // Flush queued ICE candidates for a peer after setRemoteDescription
  const flushQueuedIceCandidates = useCallback(async (targetSocketId, pc) => {
    const queue = iceCandidatesQueueRef.current[targetSocketId] || [];
    if (queue.length > 0) {
      logIce(`Flushing ${queue.length} queued ICE candidate(s) for ${targetSocketId}`);
      for (const candidate of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          logIce(`Applied queued ICE candidate for ${targetSocketId}`);
        } catch (e) {
          logIce(`Error applying queued ICE candidate for ${targetSocketId}:`, e.message);
        }
      }
      iceCandidatesQueueRef.current[targetSocketId] = [];
    }
  }, []);

  // Create an RTCPeerConnection for a remote peer socket
  const createPeerConnection = useCallback((targetSocketId, stream, peerMeta = {}) => {
    if (peersRef.current[targetSocketId]) {
      logWebRTC(`Reusing existing RTCPeerConnection for socket: ${targetSocketId}`);
      return peersRef.current[targetSocketId];
    }

    logWebRTC(`Creating new RTCPeerConnection for socket: ${targetSocketId}`);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current[targetSocketId] = pc;
    iceCandidatesQueueRef.current[targetSocketId] = [];

    // Add local tracks if stream exists
    const streamToUse = stream || localStreamRef.current;
    if (streamToUse) {
      const existingSenders = pc.getSenders();
      streamToUse.getTracks().forEach((track) => {
        const alreadyAdded = existingSenders.some((s) => s.track === track);
        if (!alreadyAdded) {
          logWebRTC(`Adding track (${track.kind}) to peer ${targetSocketId}:`, {
            id: track.id,
            enabled: track.enabled,
            readyState: track.readyState,
          });
          pc.addTrack(track, streamToUse);
        }
      });
      logWebRTC(`Peer ${targetSocketId} active senders count:`, pc.getSenders().length);
    } else {
      logWebRTC(`Warning: No local stream available when creating peer connection for ${targetSocketId}`);
    }

    // State monitoring listeners
    pc.onsignalingstatechange = () => {
      logWebRTC(`[SignalingState] ${targetSocketId} -> ${pc.signalingState}`);
      updateDiag();
    };

    pc.onconnectionstatechange = () => {
      logWebRTC(`[ConnectionState] ${targetSocketId} -> ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        logWebRTC(`Peer connection disconnected/failed for ${targetSocketId}. Cleaning up.`);
        if (peersRef.current[targetSocketId]) {
          try { peersRef.current[targetSocketId].close(); } catch (e) {}
          delete peersRef.current[targetSocketId];
        }
        setRemotePeers((prev) => {
          const next = { ...prev };
          delete next[targetSocketId];
          return next;
        });
      }
      updateDiag();
    };

    pc.oniceconnectionstatechange = () => {
      logIce(`[IceConnectionState] ${targetSocketId} -> ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        logIce(`ICE connection failed for ${targetSocketId}. Attempting restart.`);
        try { pc.restartIce(); } catch (e) {}
      }
      updateDiag();
    };

    pc.onicegatheringstatechange = () => {
      logIce(`[IceGatheringState] ${targetSocketId} -> ${pc.iceGatheringState}`);
      updateDiag();
    };

    // ICE Candidate generation handler
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        logIce(`Generated local ICE candidate for ${targetSocketId}:`, event.candidate.candidate?.slice(0, 50));
        socketRef.current.emit('meeting:iceCandidate', {
          targetSocketId,
          candidate: event.candidate,
          meetingId,
        });
      } else if (!event.candidate) {
        logIce(`ICE candidate gathering finished (null) for ${targetSocketId}`);
      }
    };

    // Remote Track arrival
    pc.ontrack = (event) => {
      logWebRTC(`[ontrack] Remote track received from ${targetSocketId}:`, {
        kind: event.track.kind,
        readyState: event.track.readyState,
        streamsLength: event.streams.length,
      });

      let remoteStream = event.streams[0];
      if (!remoteStream) {
        logWebRTC(`Creating new MediaStream for received ${event.track.kind} track from ${targetSocketId}`);
        remoteStream = new MediaStream([event.track]);
      }

      setRemotePeers((prev) => ({
        ...prev,
        [targetSocketId]: {
          stream: remoteStream,
          name: peerMeta.name || prev[targetSocketId]?.name || 'Participant',
          userId: peerMeta.userId || prev[targetSocketId]?.userId || null,
          role: peerMeta.role || prev[targetSocketId]?.role || null,
        },
      }));
      updateDiag();
    };

    updateDiag();
    return pc;
  }, [meetingId, updateDiag]);

  // Teardown connections, listeners, and media devices
  const cleanupMediaAndPeers = useCallback(() => {
    logMedia('Cleaning up all media tracks and WebRTC connections');
    // 1. Stop all tracks in local media stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          logMedia(`Stopping local track: ${track.kind} (${track.id})`);
          track.stop();
        } catch (e) {}
      });
      localStreamRef.current = null;
    }
    setLocalStream(null);

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    // 2. Close all RTCPeerConnections
    Object.keys(peersRef.current).forEach((socketId) => {
      try {
        logWebRTC(`Closing peer connection: ${socketId}`);
        peersRef.current[socketId].close();
      } catch (e) {}
    });
    peersRef.current = {};
    iceCandidatesQueueRef.current = {};

    // 3. Notify socket room of departure
    if (socketRef.current) {
      logSignal('Emitting meeting:leave for:', meetingId);
      socketRef.current.emit('meeting:leave', { meetingId });
    }

    setRemotePeers({});
    updateDiag();
  }, [meetingId, updateDiag]);

  // Leave meeting button handler
  const handleLeave = () => {
    cleanupMediaAndPeers();
    navigate('/meetings');
  };

  // Toggle audio track
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        logAudio(`Microphone toggled: enabled = ${audioTrack.enabled}`);
        updateDiag();
      }
    }
  };

  // Toggle video track
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        logVideo(`Camera toggled: enabled = ${videoTrack.enabled}`);
        updateDiag();
      }
    }
  };

  // 4. Socket Signaling Listeners Setup (CRITICAL: Registered BEFORE meeting:join)
  useEffect(() => {
    const currentSocket = socket;
    if (!currentSocket || !isConnected) return;

    logSignal('Registering authoritative WebRTC signaling listeners for socket:', currentSocket.id);

    // Participant joined room listener
    const onParticipantJoined = ({ socketId: newSocketId, name, userId: pUserId, role: pRole }) => {
      logSignal(`Peer joined meeting room: ${newSocketId} (${name}, ${pRole})`);
      setRemotePeers((prev) => ({
        ...prev,
        [newSocketId]: {
          stream: prev[newSocketId]?.stream || null,
          name: name || 'Participant',
          userId: pUserId,
          role: pRole,
        },
      }));
      updateDiag();
    };

    // Offer received -> reply with Answer
    const onOffer = async ({ senderSocketId, senderName, senderUserId, senderRole, offer }) => {
      logSignal(`Received WebRTC offer from ${senderSocketId} (${senderName})`);
      try {
        const pc = createPeerConnection(senderSocketId, localStreamRef.current, {
          name: senderName,
          userId: senderUserId,
          role: senderRole,
        });

        setRemotePeers((prev) => ({
          ...prev,
          [senderSocketId]: {
            stream: prev[senderSocketId]?.stream || null,
            name: senderName || 'Participant',
            userId: senderUserId,
            role: senderRole,
          },
        }));

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        logSignal(`Set remote description (offer) for ${senderSocketId}`);
        await flushQueuedIceCandidates(senderSocketId, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        logSignal(`Created and set local description (answer) for ${senderSocketId}`);

        currentSocket.emit('meeting:answer', {
          targetSocketId: senderSocketId,
          answer,
          meetingId,
        });
        logSignal(`Emitted meeting:answer to ${senderSocketId}`);
      } catch (err) {
        logSignal(`[ERROR] Offer/Answer processing failed for ${senderSocketId}:`, err.message);
      }
    };

    // Answer received -> setRemoteDescription
    const onAnswer = async ({ senderSocketId, answer }) => {
      logSignal(`Received WebRTC answer from ${senderSocketId}`);
      try {
        const pc = peersRef.current[senderSocketId];
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          logSignal(`Set remote description (answer) for ${senderSocketId}`);
          await flushQueuedIceCandidates(senderSocketId, pc);
        } else {
          logSignal(`Warning: Received answer for nonexistent peer ${senderSocketId}`);
        }
      } catch (err) {
        logSignal(`[ERROR] Answer processing failed for ${senderSocketId}:`, err.message);
      }
    };

    // ICE Candidate received -> add or queue
    const onIceCandidate = async ({ senderSocketId, candidate }) => {
      if (!candidate) return;
      const pc = peersRef.current[senderSocketId];
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          logIce(`Applied received ICE candidate from ${senderSocketId}`);
        } catch (e) {
          logIce(`Error applying ICE candidate from ${senderSocketId}:`, e.message);
        }
      } else {
        logIce(`Queued ICE candidate from ${senderSocketId} (remoteDescription pending)`);
        if (!iceCandidatesQueueRef.current[senderSocketId]) {
          iceCandidatesQueueRef.current[senderSocketId] = [];
        }
        iceCandidatesQueueRef.current[senderSocketId].push(candidate);
      }
    };

    // Participant left
    const onParticipantLeft = ({ socketId: leftSocketId }) => {
      logSignal(`Participant left room: ${leftSocketId}`);
      if (peersRef.current[leftSocketId]) {
        try { peersRef.current[leftSocketId].close(); } catch (e) {}
        delete peersRef.current[leftSocketId];
      }
      delete iceCandidatesQueueRef.current[leftSocketId];
      setRemotePeers((prev) => {
        const next = { ...prev };
        delete next[leftSocketId];
        return next;
      });
      updateDiag();
    };

    // Meeting ended by host
    const onMeetingEnded = () => {
      logSignal('Host ended meeting notification received');
      alert('The meeting host has ended this meeting.');
      cleanupMediaAndPeers();
      navigate('/meetings');
    };

    currentSocket.on('meeting:participantJoined', onParticipantJoined);
    currentSocket.on('meeting:offer', onOffer);
    currentSocket.on('meeting:answer', onAnswer);
    currentSocket.on('meeting:iceCandidate', onIceCandidate);
    currentSocket.on('meeting:participantLeft', onParticipantLeft);
    currentSocket.on('meeting:ended', onMeetingEnded);

    return () => {
      logSignal('Cleaning up WebRTC signaling listeners');
      currentSocket.off('meeting:participantJoined', onParticipantJoined);
      currentSocket.off('meeting:offer', onOffer);
      currentSocket.off('meeting:answer', onAnswer);
      currentSocket.off('meeting:iceCandidate', onIceCandidate);
      currentSocket.off('meeting:participantLeft', onParticipantLeft);
      currentSocket.off('meeting:ended', onMeetingEnded);
    };
  }, [
    socket,
    isConnected,
    meetingId,
    createPeerConnection,
    flushQueuedIceCandidates,
    cleanupMediaAndPeers,
    navigate,
    updateDiag,
  ]);

  // Teardown on unmount
  useEffect(() => {
    return () => {
      cleanupMediaAndPeers();
    };
  }, [cleanupMediaAndPeers]);

  // 5. Join Conference action (Transitions from Lobby -> Joined and initiates WebRTC)
  const handleJoinCall = async () => {
    setLoading(true);
    try {
      let stream = localStreamRef.current;
      // If user hasn't clicked "Enable Camera & Mic" in lobby yet, acquire now
      if (!stream) {
        logMedia('Acquiring default media on join click');
        stream = await acquireMedia({ video: true, audio: true });
        if (!stream) {
          logMedia('Falling back to audio-only join');
          stream = await acquireMedia({ video: false, audio: true });
        }
      }

      setCallState('joined');
      logSignal(`Joining meeting room: meeting:${meetingId}`);

      const currentSocket = socketRef.current;
      if (currentSocket && isConnected) {
        currentSocket.emit('meeting:join', { meetingId }, async (ack) => {
          logSignal('meeting:join ack response received:', ack);
          if (!ack?.success) {
            setError(ack?.error || 'Failed to join meeting room.');
            setCallState('lobby');
            return;
          }

          // Newly joined participant initiates offers to all existing room sockets
          const existingParticipants = ack.existingParticipants || [];
          logWebRTC(`Found ${existingParticipants.length} existing participant socket(s) in room:`, existingParticipants);

          for (const peerSocketId of existingParticipants) {
            logWebRTC(`Initiating WebRTC offer to existing peer: ${peerSocketId}`);
            const pc = createPeerConnection(peerSocketId, stream || localStreamRef.current);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            logSignal(`Created and set local offer for ${peerSocketId}`);

            currentSocket.emit('meeting:offer', {
              targetSocketId: peerSocketId,
              offer,
              meetingId,
            });
            logSignal(`Emitted meeting:offer to ${peerSocketId}`);
          }
        });
      } else {
        logSignal('[WARNING] Socket not connected when joining call');
      }
    } catch (err) {
      logSignal('[ERROR] handleJoinCall failure:', err.message);
      setError(err.message || 'Error joining conference.');
    } finally {
      setLoading(false);
      updateDiag();
    }
  };

  // Join audio only action
  const handleJoinAudioOnly = async () => {
    setLoading(true);
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => t.stop());
      }
      const stream = await acquireMedia({ video: false, audio: true });
      setIsVideoOff(true);
      setCallState('joined');

      const currentSocket = socketRef.current;
      if (currentSocket && isConnected) {
        currentSocket.emit('meeting:join', { meetingId }, async (ack) => {
          if (!ack?.success) {
            setError(ack?.error || 'Failed to join meeting room.');
            setCallState('lobby');
            return;
          }
          const existingParticipants = ack.existingParticipants || [];
          for (const peerSocketId of existingParticipants) {
            const pc = createPeerConnection(peerSocketId, stream || localStreamRef.current);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            currentSocket.emit('meeting:offer', {
              targetSocketId: peerSocketId,
              offer,
              meetingId,
            });
          }
        });
      }
    } catch (err) {
      setError(err.message || 'Error joining conference.');
    } finally {
      setLoading(false);
      updateDiag();
    }
  };

  // Deduplicate remote participants by business userId for clean UI display
  const uniqueRemoteParticipants = Object.entries(remotePeers).reduce((acc, [sockId, peer]) => {
    const key = peer.userId ? peer.userId.toString() : sockId;
    if (!acc.some((item) => (item.userId ? item.userId.toString() === key : item.socketId === sockId))) {
      acc.push({ ...peer, socketId: sockId });
    }
    return acc;
  }, []);

  const liveParticipantCount = 1 + uniqueRemoteParticipants.length;

  // Loading state
  if (loading && !meeting) {
    return (
      <div className="h-[75vh] flex items-center justify-center">
        <LoadingSpinner message="Connecting to meeting room..." />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-8 max-w-xl mx-auto space-y-4 text-center">
        <div className="p-3 bg-red-100 dark:bg-red-950 text-red-600 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Unable to join meeting</h2>
        <p className="text-xs text-zinc-500">{error}</p>
        <Button variant="primary" size="sm" icon={ArrowLeft} onClick={() => navigate('/meetings')}>
          Return to Meetings
        </Button>
      </div>
    );
  }

  // ==========================================
  // VIEW 1: PRE-JOIN LOBBY / PREVIEW
  // ==========================================
  if (callState === 'lobby') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header Card */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-card p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {meeting?.title || 'Video Meeting'}
                </h1>
                <Badge variant="primary">Lobby</Badge>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Preview camera & microphone before joining the meeting.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="xs"
                icon={Activity}
                onClick={() => setShowDiagPanel(!showDiagPanel)}
              >
                Diagnostics
              </Button>
              <Button
                variant="secondary"
                size="xs"
                icon={ArrowLeft}
                onClick={() => navigate('/meetings')}
              >
                Back
              </Button>
            </div>
          </div>
        </div>

        {/* Diagnostic Panel (Collapsible) */}
        {showDiagPanel && (
          <div className="p-4 bg-zinc-900 text-zinc-200 border border-zinc-700 rounded-xl text-xs space-y-2 font-mono">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="font-bold text-brand-400">Meeting Diagnostics (Live Monitor)</span>
              <button onClick={() => updateDiag()} className="text-[10px] text-zinc-400 hover:text-white underline">
                Refresh
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
              <div>Secure Context: <span className={diagInfo.secureContext ? 'text-emerald-400' : 'text-red-400'}>{String(diagInfo.secureContext)}</span></div>
              <div>MediaDevices API: <span className={diagInfo.mediaDevicesAvailable ? 'text-emerald-400' : 'text-red-400'}>{String(diagInfo.mediaDevicesAvailable)}</span></div>
              <div>Socket Connected: <span className={diagInfo.socketConnected ? 'text-emerald-400' : 'text-red-400'}>{String(diagInfo.socketConnected)}</span></div>
              <div>Local Stream: <span className={diagInfo.localStreamActive ? 'text-emerald-400' : 'text-zinc-500'}>{diagInfo.localStreamActive ? 'Active' : 'Inactive'}</span></div>
              <div>Video Track: <span className="text-zinc-300">{diagInfo.videoTrackCount} ({diagInfo.videoTrackState}, enabled:{String(diagInfo.videoTrackEnabled)})</span></div>
              <div>Audio Track: <span className="text-zinc-300">{diagInfo.audioTrackCount} ({diagInfo.audioTrackState}, enabled:{String(diagInfo.audioTrackEnabled)})</span></div>
              <div>Video Resolution: <span className="text-zinc-300">{diagInfo.videoResolution}</span></div>
              <div>Video ReadyState: <span className="text-zinc-300">{diagInfo.videoElementReadyState}</span></div>
              <div>Active Peers: <span className="text-zinc-300">{diagInfo.peerCount}</span></div>
            </div>
          </div>
        )}

        {mediaError && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <span className="font-semibold">Media Notice: </span>
              {mediaError}
            </div>
          </div>
        )}

        {/* Device Status Bar */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-300">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Camera</p>
                <p className="text-[11px] text-zinc-400">
                  {cameraStatus === 'ready' && 'Ready (Streaming)'}
                  {cameraStatus === 'off' && 'Disabled'}
                  {cameraStatus === 'blocked' && 'Permission Blocked'}
                  {cameraStatus === 'unsupported' && 'Not Detected'}
                  {cameraStatus === 'idle' && 'Awaiting Setup'}
                </p>
              </div>
            </div>
            {cameraStatus === 'ready' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : cameraStatus === 'blocked' ? (
              <XCircle className="w-4 h-4 text-red-500" />
            ) : (
              <Radio className="w-4 h-4 text-zinc-400" />
            )}
          </div>

          <div className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-700 dark:text-zinc-300">
                <Mic className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Microphone</p>
                <p className="text-[11px] text-zinc-400">
                  {micStatus === 'ready' && 'Ready (Active)'}
                  {micStatus === 'off' && 'Disabled'}
                  {micStatus === 'blocked' && 'Permission Blocked'}
                  {micStatus === 'unsupported' && 'Not Detected'}
                  {micStatus === 'idle' && 'Awaiting Setup'}
                </p>
              </div>
            </div>
            {micStatus === 'ready' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : micStatus === 'blocked' ? (
              <XCircle className="w-4 h-4 text-red-500" />
            ) : (
              <Radio className="w-4 h-4 text-zinc-400" />
            )}
          </div>
        </div>

        {/* Local Video Preview Canvas (Robust CSS Container) */}
        <div
          className="relative bg-black rounded-2xl overflow-hidden border border-zinc-800 shadow-xl flex items-center justify-center"
          style={{ width: '100%', minHeight: '260px', aspectRatio: '16/9' }}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${cameraStatus === 'ready' && !isVideoOff ? 'block' : 'hidden'}`}
            style={{ transform: 'scaleX(-1)', minHeight: '260px' }}
          />

          {(cameraStatus !== 'ready' || isVideoOff) && (
            <div className="flex flex-col items-center gap-3 text-zinc-500 text-center p-6">
              <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center font-bold text-zinc-400 text-2xl border border-zinc-800">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-300">
                  {cameraStatus === 'ready' && isVideoOff
                    ? 'Camera is Muted'
                    : cameraStatus === 'blocked'
                    ? 'Camera Permission Denied'
                    : cameraStatus === 'unsupported'
                    ? 'No Camera Hardware Detected'
                    : 'Camera Preview Off'}
                </p>
                <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">
                  {cameraStatus === 'ready'
                    ? 'Preview stream is active. Click Join Meeting to enter conference.'
                    : 'Click Enable Camera & Microphone below to grant permission and preview stream.'}
                </p>
              </div>
            </div>
          )}

          {playbackBlocked && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 text-center z-10">
              <p className="text-xs text-amber-300 mb-2">
                Camera stream is active, but playback was blocked by browser. Click to start.
              </p>
              <Button
                variant="primary"
                size="xs"
                icon={Play}
                onClick={() => {
                  localVideoRef.current?.play().then(() => setPlaybackBlocked(false)).catch(() => {});
                }}
              >
                Start Video
              </Button>
            </div>
          )}

          <div className="absolute bottom-3 left-3 px-2.5 py-1 bg-black/70 backdrop-blur-sm rounded-lg text-xs font-medium text-white flex items-center gap-2">
            <span>{user?.name || 'You'} (Preview)</span>
            {cameraStatus === 'ready' && !isVideoOff && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </div>
        </div>

        {/* Action Controls - Clear Separation of Enable Preview vs Join */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          {cameraStatus !== 'ready' ? (
            <Button
              variant="primary"
              size="md"
              icon={Camera}
              onClick={() => acquireMedia({ video: true, audio: true })}
              isLoading={loading}
            >
              Enable Camera & Microphone
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              icon={VideoIcon}
              onClick={handleJoinCall}
              isLoading={loading}
            >
              Join Meeting
            </Button>
          )}

          {cameraStatus === 'ready' ? (
            <Button
              variant="secondary"
              size="md"
              icon={isVideoOff ? VideoIcon : VideoOff}
              onClick={toggleVideo}
            >
              {isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="md"
              icon={Mic}
              onClick={handleJoinAudioOnly}
              isLoading={loading}
            >
              Join with Audio Only
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW 2: ACTIVE MESH VIDEO CONFERENCE ROOM
  // ==========================================
  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] bg-zinc-950 text-zinc-100 rounded-card overflow-hidden border border-zinc-800 shadow-2xl">
      {/* Top Bar */}
      <div className="h-14 px-4 bg-zinc-900/90 border-b border-zinc-800/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold truncate max-w-xs sm:max-w-md text-zinc-100">
            {meeting?.title || 'Video Conference'}
          </h1>
          <Badge variant="success">P2P Mesh</Badge>
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <Button
            variant="secondary"
            size="xs"
            icon={Activity}
            onClick={() => setShowDiagPanel(!showDiagPanel)}
          >
            Diagnostics
          </Button>
          <span className="flex items-center gap-1.5 font-medium px-2 py-1 bg-zinc-800/80 rounded-md">
            <Users className="w-4 h-4 text-brand-400" />
            {liveParticipantCount} in call
          </span>
          <Button variant="danger" size="xs" icon={PhoneOff} onClick={handleLeave}>
            Leave
          </Button>
        </div>
      </div>

      {/* Diagnostics Panel in Call View */}
      {showDiagPanel && (
        <div className="p-3 bg-zinc-900 text-zinc-200 border-b border-zinc-800 text-xs font-mono shrink-0 overflow-x-auto">
          <div className="flex items-center justify-between pb-1 mb-1 border-b border-zinc-800 text-[11px] text-brand-400 font-bold">
            <span>In-Call Diagnostic Stream Inspector</span>
            <button onClick={() => updateDiag()} className="underline text-zinc-400 hover:text-white">Refresh</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>Local Video: <span className="text-zinc-300">{diagInfo.videoResolution} ({diagInfo.videoTrackState})</span></div>
            <div>Local Audio: <span className="text-zinc-300">{diagInfo.audioTrackState} (en:{String(diagInfo.audioTrackEnabled)})</span></div>
            <div>Peer Connections: <span className="text-zinc-300">{diagInfo.peerCount}</span></div>
            <div>Remote Streams: <span className="text-zinc-300">{diagInfo.remoteStreamCount}</span></div>
          </div>
          {Object.keys(diagInfo.peersStatus).length > 0 && (
            <div className="mt-2 text-[10px] text-zinc-400 border-t border-zinc-800 pt-1">
              {Object.entries(diagInfo.peersStatus).map(([sid, stat]) => (
                <div key={sid} className="truncate">
                  Peer {sid.slice(0, 8)}...: Conn={stat.connectionState} | Ice={stat.iceConnectionState} | Sig={stat.signalingState}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Media Notice */}
      {mediaError && (
        <div className="px-4 py-2 bg-amber-950/80 border-b border-amber-800/60 text-amber-300 text-xs flex items-center gap-2 shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{mediaError}</span>
        </div>
      )}

      {/* Responsive Video Canvas (Clean, robust flex/grid container) */}
      <div className="flex-1 p-4 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-center justify-center">
        {/* Local Stream Tile */}
        <div
          className="relative bg-black rounded-xl overflow-hidden border border-zinc-800 shadow-inner flex items-center justify-center"
          style={{ width: '100%', minHeight: '240px', aspectRatio: '16/9' }}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${isVideoOff || cameraStatus !== 'ready' ? 'hidden' : 'block'}`}
            style={{ transform: 'scaleX(-1)', minHeight: '240px' }}
          />

          {(isVideoOff || cameraStatus !== 'ready') && (
            <div className="flex flex-col items-center gap-2 text-zinc-500">
              <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-zinc-300 text-xl border border-zinc-700">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <span className="text-xs font-medium">
                {cameraStatus === 'blocked'
                  ? 'Camera Blocked'
                  : cameraStatus === 'unsupported'
                  ? 'No Camera Hardware'
                  : isVideoOff
                  ? 'Camera Muted'
                  : 'Camera Off'}
              </span>
            </div>
          )}

          {playbackBlocked && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 text-center z-10">
              <p className="text-xs text-amber-300 mb-2">
                Local playback was blocked by browser. Click to resume.
              </p>
              <Button
                variant="primary"
                size="xs"
                icon={Play}
                onClick={() => {
                  localVideoRef.current?.play().then(() => setPlaybackBlocked(false)).catch(() => {});
                }}
              >
                Click to Play
              </Button>
            </div>
          )}

          <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded text-[11px] font-medium text-white flex items-center gap-1.5">
            <span>You ({user?.name})</span>
            {isMuted && <MicOff className="w-3 h-3 text-red-400" />}
          </div>
        </div>

        {/* Remote Participant Streams */}
        {uniqueRemoteParticipants.map((peer) => (
          <RemoteVideoCard key={peer.socketId} peerId={peer.socketId} peerData={peer} />
        ))}
      </div>

      {/* Bottom Controls Dock */}
      <div className="h-16 bg-zinc-900/95 border-t border-zinc-800 flex items-center justify-center gap-3 px-4 shrink-0">
        <button
          type="button"
          onClick={toggleMute}
          title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          className={`p-3 rounded-full transition-colors ${
            isMuted
              ? 'bg-red-600 text-white hover:bg-red-500'
              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
          }`}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={toggleVideo}
          title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
          className={`p-3 rounded-full transition-colors ${
            isVideoOff
              ? 'bg-red-600 text-white hover:bg-red-500'
              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
          }`}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={handleLeave}
          title="Leave conference"
          className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-full font-semibold text-xs flex items-center gap-2 shadow-lg transition-colors ml-2"
        >
          <PhoneOff className="w-4 h-4" />
          <span>Leave</span>
        </button>
      </div>
    </div>
  );
};

// Remote participant video tile with stream attachment, audio non-muting, and playback retry
const RemoteVideoCard = ({ peerId, peerData }) => {
  const videoRef = useRef(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !peerData?.stream) return;

    logVideo(`Attaching remote stream from peer ${peerId} to <video>`, {
      streamId: peerData.stream.id,
      tracks: peerData.stream.getTracks().map((t) => `${t.kind}:${t.readyState}`),
    });

    videoEl.srcObject = peerData.stream;

    const onLoadedMetadata = () => {
      logVideo(`Remote <video> loadedmetadata for peer ${peerId}:`, {
        width: videoEl.videoWidth,
        height: videoEl.videoHeight,
      });
      setVideoDimensions({ width: videoEl.videoWidth, height: videoEl.videoHeight });
    };

    const onPlaying = () => {
      logVideo(`Remote <video> playing for peer ${peerId}`);
      setPlaybackBlocked(false);
    };

    const onError = (e) => {
      logVideo(`Remote <video> error for peer ${peerId}:`, e);
    };

    videoEl.addEventListener('loadedmetadata', onLoadedMetadata);
    videoEl.addEventListener('playing', onPlaying);
    videoEl.addEventListener('error', onError);

    const playPromise = videoEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise
        .then(() => {
          logVideo(`Remote <video> play() resolved for peer ${peerId}`);
          setPlaybackBlocked(false);
        })
        .catch((err) => {
          logVideo(`Remote <video> play() blocked for peer ${peerId}:`, err.name, err.message);
          setPlaybackBlocked(true);
        });
    }

    return () => {
      videoEl.removeEventListener('loadedmetadata', onLoadedMetadata);
      videoEl.removeEventListener('playing', onPlaying);
      videoEl.removeEventListener('error', onError);
      videoEl.srcObject = null;
    };
  }, [peerId, peerData?.stream]);

  const hasVideoTrack = peerData?.stream && peerData.stream.getVideoTracks().length > 0;
  const hasAudioTrack = peerData?.stream && peerData.stream.getAudioTracks().length > 0;

  return (
    <div
      className="relative bg-black rounded-xl overflow-hidden border border-zinc-800 shadow-inner flex items-center justify-center"
      style={{ width: '100%', minHeight: '240px', aspectRatio: '16/9' }}
    >
      {/* Remote Video element - NOTE: NEVER MUTED so audio is heard */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover bg-black ${hasVideoTrack ? 'block' : 'hidden'}`}
        style={{ minHeight: '240px' }}
      />

      {!hasVideoTrack && (
        <div className="flex flex-col items-center gap-2 text-zinc-500">
          <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-zinc-300 text-xl border border-zinc-700">
            {peerData?.name?.charAt(0) || 'P'}
          </div>
          <span className="text-xs font-medium">{peerData?.name || 'Connecting...'}</span>
          <span className="text-[10px] text-zinc-500">
            {hasAudioTrack ? 'Audio Only' : 'Connecting media stream...'}
          </span>
        </div>
      )}

      {playbackBlocked && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-4 text-center z-10">
          <p className="text-xs text-amber-300 mb-2">Remote stream playback was blocked by browser.</p>
          <Button
            variant="primary"
            size="xs"
            icon={Play}
            onClick={() => {
              videoRef.current?.play().then(() => setPlaybackBlocked(false)).catch(() => {});
            }}
          >
            Click to Play
          </Button>
        </div>
      )}

      <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur-sm rounded text-[11px] font-medium text-white flex items-center gap-1.5">
        <span>{peerData?.name || 'Participant'}</span>
        {peerData?.role && <span className="text-[10px] text-zinc-400 capitalize">({peerData.role})</span>}
      </div>
    </div>
  );
};
