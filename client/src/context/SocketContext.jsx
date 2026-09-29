import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.jsx';

const SocketContext = createContext(null);

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:5000';

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [syncPulse, setSyncPulse] = useState(false);
  const pulseTimerRef = useRef(null);

  const triggerSyncPulse = useCallback(() => {
    setSyncPulse(true);
    if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = setTimeout(() => {
      setSyncPulse(false);
    }, 1500);
  }, []);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    // Initialize Socket.IO connection with credentials
    const socketClient = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketClient.on('connect', () => {
      setConnected(true);
      triggerSyncPulse();
    });

    socketClient.on('disconnect', (reason) => {
      setConnected(false);
    });

    socketClient.on('connect_error', (err) => {
      setConnected(false);
    });

    // Real-time synchronization events that trigger global sync indicator
    const syncEvents = [
      'task:assigned',
      'task:statusChanged',
      'chat:message',
      'presence:update',
      'notification:new',
      'team:memberAdded',
      'team:memberRemoved',
    ];

    syncEvents.forEach((ev) => {
      socketClient.on(ev, () => {
        triggerSyncPulse();
      });
    });

    setSocket(socketClient);

    return () => {
      syncEvents.forEach((ev) => socketClient.off(ev));
      socketClient.disconnect();
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, [user, triggerSyncPulse]);

  return (
    <SocketContext.Provider value={{ socket, connected, syncPulse, triggerSyncPulse }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
