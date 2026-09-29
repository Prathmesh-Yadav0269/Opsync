import React, { useState, useEffect, useRef, useCallback } from 'react';
import { chatsApi } from '../../api/chats.js';
import { filesApi } from '../../api/files.js';
import { usersApi } from '../../api/users.js';
import { teamsApi } from '../../api/teams.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSocket } from '../../context/SocketContext.jsx';
import { Card } from '../../components/common/Card.jsx';
import { Button } from '../../components/common/Button.jsx';
import { Badge } from '../../components/common/Badge.jsx';
import { EmptyState } from '../../components/common/EmptyState.jsx';
import { LoadingSpinner } from '../../components/common/LoadingSpinner.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { Alert } from '../../components/common/Alert.jsx';
import {
  MessageSquare,
  Send,
  Users,
  User,
  Plus,
  Circle,
  Clock,
  ArrowLeft,
  Check,
  CheckCheck,
  Paperclip,
  FileText,
  Download,
} from 'lucide-react';

export const ChatPage = () => {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());

  // New Direct Chat Modal
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [modalError, setModalError] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Load chat conversations
  const loadChats = useCallback(async () => {
    try {
      setLoadingChats(true);
      const res = await chatsApi.getChats();
      setChats(res.data?.chats || []);
    } catch (err) {
      console.error('Failed to load chats', err);
    } finally {
      setLoadingChats(false);
    }
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Load messages when selectedChat changes
  useEffect(() => {
    if (!selectedChat) return;

    let isMounted = true;
    const fetchMessages = async () => {
      setLoadingMessages(true);
      try {
        const res = await chatsApi.getMessages(selectedChat._id);
        if (isMounted) {
          setMessages(res.data?.messages || []);
          // Join socket chat room
          if (socket) {
            socket.emit('chat:join', { roomId: selectedChat._id });
            socket.emit('chat:read', { roomId: selectedChat._id });
          }
        }
      } catch (err) {
        console.error('Failed to load messages', err);
      } finally {
        if (isMounted) setLoadingMessages(false);
      }
    };

    fetchMessages();

    return () => {
      isMounted = false;
      if (socket) {
        socket.emit('chat:leave', { roomId: selectedChat._id });
      }
    };
  }, [selectedChat, socket]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  // Socket event subscriptions
  useEffect(() => {
    if (!socket) return;

    const handleIncomingMessage = (msg) => {
      if (selectedChat && msg.room === selectedChat._id) {
        setMessages((prev) => [...prev, msg]);
        socket.emit('chat:read', { roomId: selectedChat._id });
      }

      // Update last message in chats list
      setChats((prev) =>
        prev.map((c) =>
          c._id === msg.room
            ? { ...c, lastMessage: msg, updatedAt: new Date().toISOString() }
            : c
        )
      );
    };

    const handleTypingStart = ({ roomId, userId: typistId, name }) => {
      if (selectedChat && roomId === selectedChat._id && typistId !== user._id) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(typistId, name || 'Someone');
          return next;
        });
      }
    };

    const handleTypingStop = ({ roomId, userId: typistId }) => {
      if (selectedChat && roomId === selectedChat._id) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(typistId);
          return next;
        });
      }
    };

    const handleReadReceipt = ({ roomId, userId: readerId }) => {
      if (selectedChat && roomId === selectedChat._id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.sender?._id !== readerId && !m.readBy?.includes(readerId)
              ? { ...m, readBy: [...(m.readBy || []), readerId] }
              : m
          )
        );
      }
    };

    const handlePresenceUpdate = ({ userId: pUserId, status }) => {
      setOnlineUserIds((prev) => {
        const next = new Set(prev);
        if (status === 'online') {
          next.add(pUserId);
        } else {
          next.delete(pUserId);
        }
        return next;
      });
    };

    socket.on('chat:message', handleIncomingMessage);
    socket.on('chat:typing:start', handleTypingStart);
    socket.on('chat:typing:stop', handleTypingStop);
    socket.on('chat:read', handleReadReceipt);
    socket.on('presence:update', handlePresenceUpdate);

    return () => {
      socket.off('chat:message', handleIncomingMessage);
      socket.off('chat:typing:start', handleTypingStart);
      socket.off('chat:typing:stop', handleTypingStop);
      socket.off('chat:read', handleReadReceipt);
      socket.off('presence:update', handlePresenceUpdate);
    };
  }, [socket, selectedChat, user._id]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedChat || !socket) return;

    const content = messageText.trim();
    setMessageText('');

    // Emit chat:typing:stop immediately on submit
    socket.emit('chat:typing:stop', { roomId: selectedChat._id });

    // Live Socket emission (with DB persistence handled by server)
    socket.emit('chat:send', { roomId: selectedChat._id, content }, (ack) => {
      if (!ack?.success) {
        console.error('Failed to deliver message', ack?.error);
      }
    });
  };

  const handleTypingChange = (e) => {
    setMessageText(e.target.value);
    if (!socket || !selectedChat) return;

    socket.emit('chat:typing:start', { roomId: selectedChat._id });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('chat:typing:stop', { roomId: selectedChat._id });
    }, 2000);
  };

  const openNewChatModal = async () => {
    setModalError('');
    setNewChatModalOpen(true);
    try {
      const res = await usersApi.getUsers();
      const allUsers = res.data?.users || [];
      // Filter out self
      setAvailableUsers(allUsers.filter((u) => u._id !== user._id));
    } catch (err) {
      setModalError('Failed to load user directory.');
    }
  };

  const handleCreateDirectChat = async (e) => {
    e.preventDefault();
    if (!selectedUserId) {
      setModalError('Please select a user to chat with.');
      return;
    }
    setModalLoading(true);
    setModalError('');
    try {
      const res = await chatsApi.getOrCreateDirectChat(selectedUserId);
      const room = res.data?.chat;
      setNewChatModalOpen(false);
      setSelectedUserId('');
      await loadChats();
      setSelectedChat(room);
    } catch (err) {
      setModalError(err.message || 'Failed to initialize direct chat.');
    } finally {
      setModalLoading(false);
    }
  };

  const getChatTitle = (chat) => {
    if (chat.type === 'team') {
      return chat.team?.name || 'Team Workspace';
    }
    const otherUser = chat.members?.find((m) => m._id !== user._id);
    return otherUser?.name || 'Direct Conversation';
  };

  const getOtherUser = (chat) => {
    if (chat.type === 'team') return null;
    return chat.members?.find((m) => m._id !== user._id);
  };

  const handleChatFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat || !socket) return;
    try {
      const res = await filesApi.uploadChatFile(selectedChat._id, file);
      const uploaded = res.data?.file;
      socket.emit(
        'chat:send',
        {
          roomId: selectedChat._id,
          content: `[Attachment: ${uploaded.originalName}] fileId:${uploaded._id}`,
        },
        (resp) => {
          if (!resp?.success) {
            console.error('Socket send failed', resp?.error);
          }
          loadMessages(selectedChat._id);
        }
      );
      e.target.value = '';
    } catch (err) {
      alert(err.message || 'Chat attachment failed to upload.');
    }
  };

  return (
    <div className="h-[calc(100vh-8.5rem)] flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar: Conversations List */}
        <div
          className={`w-full md:w-80 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50/50 dark:bg-zinc-900/50 ${
            selectedChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Header */}
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-brand-600" />
              <h2 className="font-bold text-sm text-zinc-900 dark:text-zinc-100">
                Conversations
              </h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              icon={Plus}
              onClick={openNewChatModal}
              title="New Direct Chat"
            >
              New
            </Button>
          </div>

          {/* Chats scroll list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingChats ? (
              <LoadingSpinner message="Loading chats..." />
            ) : chats.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-400">
                No active conversations. Click "New" to start chatting.
              </div>
            ) : (
              chats.map((c) => {
                const other = getOtherUser(c);
                const isOnline = other && onlineUserIds.has(other._id);
                const isSelected = selectedChat?._id === c._id;

                return (
                  <div
                    key={c._id}
                    onClick={() => setSelectedChat(c)}
                    className={`p-3 rounded-xl cursor-pointer transition-all flex items-start gap-3 ${
                      isSelected
                        ? 'bg-brand-50/80 dark:bg-brand-950/40 border border-brand-200/80 dark:border-brand-800/80'
                        : 'hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 border border-transparent'
                    }`}
                  >
                    <div className="relative shrink-0 mt-0.5">
                      <div className="w-9 h-9 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                        {c.type === 'team' ? (
                          <Users className="w-4 h-4 text-brand-600" />
                        ) : other?.name ? (
                          other.name.charAt(0).toUpperCase()
                        ) : (
                          <User className="w-4 h-4" />
                        )}
                      </div>
                      {c.type === 'one-to-one' && (
                        <span
                          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-zinc-900 ${
                            isOnline ? 'bg-emerald-500' : 'bg-zinc-400'
                          }`}
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                          {getChatTitle(c)}
                        </span>
                        {c.unreadCount > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-brand-600 text-white rounded-full flex items-center justify-center">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                        {c.lastMessage?.content || <span className="italic">No messages yet</span>}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Conversation */}
        <div
          className={`flex-1 flex flex-col bg-white dark:bg-zinc-900 ${
            !selectedChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {selectedChat ? (
            <>
              {/* Conversation Header */}
              <div className="px-6 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-900">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedChat(null)}
                    className="md:hidden p-1 rounded text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>

                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                      {getChatTitle(selectedChat)}
                      <Badge variant="neutral">
                        {selectedChat.type === 'team' ? 'Team Channel' : 'Direct'}
                      </Badge>
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {selectedChat.type === 'team' ? (
                        `${selectedChat.members?.length || 0} members in team`
                      ) : (
                        (() => {
                          const other = getOtherUser(selectedChat);
                          if (!other) return '';
                          const isOnline = onlineUserIds.has(other._id);
                          return isOnline
                            ? 'Online now'
                            : other.lastSeen
                            ? `Last seen ${new Date(other.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Offline';
                        })()
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Messages Feed */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {loadingMessages ? (
                  <LoadingSpinner message="Fetching conversation history..." />
                ) : messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <EmptyState
                      icon={MessageSquare}
                      title="No messages yet"
                      description="Send a message below to start collaborating in real-time."
                    />
                  </div>
                ) : (
                  messages.map((m) => {
                    const isSelf = m.sender?._id === user._id;
                    const isRead = m.readBy && m.readBy.length > 1;

                    return (
                      <div
                        key={m._id}
                        className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}
                      >
                        {!isSelf && (
                          <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1 ml-1">
                            {m.sender?.name || 'User'}
                          </span>
                        )}

                        <div
                          className={`max-w-md px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${
                            isSelf
                              ? 'bg-brand-600 text-white rounded-br-none shadow-sm'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-none'
                          }`}
                        >
                          {m.content.startsWith('[Attachment:') ? (
                            (() => {
                              const match = m.content.match(/\[Attachment:\s*(.*?)\]\s*fileId:([a-fA-F0-9]+)/);
                              const fileName = match ? match[1] : 'File Attachment';
                              const fileId = match ? match[2] : null;

                              return (
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 shrink-0" />
                                    <span className="font-semibold truncate max-w-[180px]">{fileName}</span>
                                  </div>
                                  {fileId && (
                                    <a
                                      href={filesApi.downloadFileUrl(fileId)}
                                      target="_blank"
                                      rel="noreferrer"
                                      download={fileName}
                                      className={`inline-flex items-center gap-1 text-[11px] font-semibold py-1 px-2.5 rounded-lg transition-colors ${
                                        isSelf
                                          ? 'bg-brand-700 hover:bg-brand-800 text-white'
                                          : 'bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-200'
                                      }`}
                                    >
                                      <Download className="w-3 h-3" /> Download
                                    </a>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 mt-1 text-[10px] text-zinc-400 px-1">
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {isSelf && (
                            isRead ? (
                              <CheckCheck className="w-3 h-3 text-brand-600 dark:text-brand-400" title="Read" />
                            ) : (
                              <Check className="w-3 h-3 text-zinc-400" title="Sent" />
                            )
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Typing Indicator */}
                {typingUsers.size > 0 && (
                  <div className="flex items-center gap-2 text-xs text-zinc-400 italic py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" />
                    <span>
                      {Array.from(typingUsers.values()).join(', ')}{' '}
                      {typingUsers.size === 1 ? 'is' : 'are'} typing...
                    </span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <label className="p-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50 dark:bg-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer text-zinc-500 hover:text-brand-600 transition-colors">
                    <Paperclip className="w-4 h-4" />
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleChatFileUpload}
                    />
                  </label>
                  <input
                    type="text"
                    placeholder="Write a message..."
                    value={messageText}
                    onChange={handleTypingChange}
                    className="flex-1 text-xs py-2.5 px-4 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    icon={Send}
                    disabled={!messageText.trim()}
                  >
                    Send
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center">
              <EmptyState
                icon={MessageSquare}
                title="No conversation selected"
                description="Choose a conversation from the sidebar or start a new direct chat."
              />
            </div>
          )}
        </div>
      </div>

      {/* New Direct Chat Modal */}
      <Modal
        isOpen={newChatModalOpen}
        onClose={() => setNewChatModalOpen(false)}
        title="Start Direct Chat"
        description="Select an active coworker to open an authorized one-to-one room."
      >
        <form onSubmit={handleCreateDirectChat} className="space-y-4">
          {modalError && <Alert type="error" message={modalError} />}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Select User
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full py-2 px-3 text-sm bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg"
              required
            >
              <option value="">Select coworker...</option>
              {availableUsers.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} ({u.role}) {u.department ? `[${u.department}]` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <Button variant="secondary" onClick={() => setNewChatModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={modalLoading}>
              Start Chat
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
