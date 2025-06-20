import React, { Component, createRef } from 'react';
import './ChatBox.css';
import assets from '../../assets/assets';
import { collection, addDoc, doc, getDoc, onSnapshot, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { formatDistanceToNow } from 'date-fns';
import { ImAttachment } from 'react-icons/im';
import { FaFile, FaImage } from 'react-icons/fa';
import { FaTimes } from 'react-icons/fa';
import toast from 'react-hot-toast';
import { observer } from 'mobx-react';
import chatStore from '../../mobexStore/chatStore';
import { Virtuoso } from 'react-virtuoso';

class ChatBox extends Component {
  constructor(props) {
    super(props);

    this.state = {
      input: "",
      loading: false,
      typing: false,
      typingTimeout: null,
      filemenu: false,
      previewUrl: null
    };

    this.messagesEndRef = createRef();
    this.virtuosoRef = createRef();

   
    this._isAtBottom = true;
    this._shouldAutoScroll = true;
    this._scrollTimeouts = [];

    
    this.prevStoreValues = {
      messageId: null,
      chatUserId: null,
      messagesLength: 0
    };
  }

 
  componentDidMount() {
    this.addEnterKeyListener();

    if (chatStore.user?.id) {
      chatStore.setOnlineStatus();
    }

    window.addEventListener('resize', this.handleResize);
  }

  componentDidUpdate(prevProps, prevState) {
    const { messageId, chatUser, messages, user } = chatStore;
   
    if (!prevProps || (!prevProps.chatUser && chatUser)) {
      setTimeout(this.addEnterKeyListener, 300);
    }

    if (!this.prevStoreValues) {
      this.prevStoreValues = {
        messageId: null,
        chatUserId: null,
        messagesLength: 0
      };
    }

    if (messageId !== this.prevStoreValues.messageId && messageId) {
      this.setupMessageListeners();
      this.prevStoreValues.messageId = messageId;
    }

    if (chatUser?.user?.id !== this.prevStoreValues.chatUserId && chatUser?.user?.id) {
      this.setupUserStatusListener();
      this.prevStoreValues.chatUserId = chatUser?.user?.id;
    }

    if (messages.length !== this.prevStoreValues.messagesLength) {
      if (messages.length > 0) {
        this._scrollTimeouts.push(
          setTimeout(() => this.scrollToBottom(true), 200)
        );

        this._scrollTimeouts.push(
          setTimeout(() => this.scrollToBottom(true), 500)
        );
      }
      this.prevStoreValues.messagesLength = messages.length;
    }

    if ((messages.length !== this.prevStoreValues.messagesLength ||
      messageId !== this.prevStoreValues.messageId) &&
      messages.length > 0 && user) {
      this.markMessagesAsRead();
    }
  }

  componentWillUnmount() {
    if (this.unsubMessages) {
      this.unsubMessages();
      this.unsubMessages = null;
    }

    if (this.unsubTyping) {
      this.unsubTyping();
      this.unsubTyping = null;
    }

    if (this.unsubStatus) {
      this.unsubStatus();
      this.unsubStatus = null;
    }

    this.removeEnterKeyListener();

    if (this.state.typingTimeout) {
      clearTimeout(this.state.typingTimeout);
    }

    if (this._scrollTimeouts && this._scrollTimeouts.length > 0) {
      this._scrollTimeouts.forEach(timeout => clearTimeout(timeout));
      this._scrollTimeouts = [];
    }

    window.removeEventListener('resize', this.handleResize);
  }

  setupMessageListeners = () => {
    const { messageId } = chatStore;
    const { chatUser } = chatStore;

    if (!this.state.loading) {
      this.setState({ loading: true });
    }

    const chatMessagesRef = collection(db, 'messages', messageId, 'chatMessages');
    const q = query(chatMessagesRef, orderBy('createdAt', 'asc'));

    if (this.unsubMessages) this.unsubMessages();
    if (this.unsubTyping) this.unsubTyping();

    this.unsubMessages = onSnapshot(q, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      chatStore.setMessages(messagesData);
      this.setState({ loading: false });

      if (messagesData.length > 0) {
        this._scrollTimeouts.push(
          setTimeout(() => this.scrollToBottom(true), 300)
        );
      }
    });

    this.unsubTyping = onSnapshot(doc(db, 'messages', messageId), (doc) => {
      if (doc.exists() && chatUser?.rId) {
        const typingStatus = doc.data()[`typing_${chatUser.rId}`];
      }
    });
  }

  setupUserStatusListener = () => {
    const { chatUser } = chatStore;

    if (!chatUser?.user?.id) return;

    if (this.unsubStatus) this.unsubStatus();

    this.lastKnownOnlineState = chatUser.user.isOnline;

    const userStatusRef = doc(db, "userStatus", chatUser.user.id);
    this.unsubStatus = onSnapshot(userStatusRef, (doc) => {
      if (doc.exists()) {
        const isOnlineNow = doc.data().online || false;

        const updatedUser = {
          ...chatUser,
          user: {
            ...chatUser.user,
            isOnline: isOnlineNow,
            lastSeen: doc.data().lastSeen ? doc.data().lastSeen.toDate() : null
          }
        };

        chatStore.setChatUser(updatedUser);

        if (isOnlineNow && this.lastKnownOnlineState === false) {
          toast.success(`${chatUser.user.username || "User"} is now online`, {
            icon: '🟢',
            duration: 2000,
            position: 'bottom-left',
            style: { background: '#f0f9eb', color: '#333' }
          });
        }

        this.lastKnownOnlineState = isOnlineNow;
      }
    });
  }

  scrollToBottom = (force = false) => {
    const { messages } = chatStore;
    if (!messages || messages.length === 0) return;

    const attemptScroll = () => {
      if (this.virtuosoRef.current) {
        try {
          this.virtuosoRef.current.scrollToIndex({
            index: messages.length - 1,
            behavior: force ? 'auto' : 'smooth',
            align: 'end'
          });
        } catch (err) {
          console.log("Error with Virtuoso scrollToIndex:", err);

          try {
            this.virtuosoRef.current.scrollTo({
              top: 999999,
              behavior: force ? 'auto' : 'smooth'
            });
          } catch (err2) {
            console.log("Error with Virtuoso scrollTo:", err2);
          }
        }
      }

      if (this.messagesEndRef.current) {
        try {
          this.messagesEndRef.current.scrollIntoView({
            behavior: force ? 'auto' : 'smooth',
            block: 'end'
          });
        } catch (err) {
          console.log("Error with messagesEndRef.scrollIntoView:", err);
        }
      }

      try {
        const chatContainer = document.querySelector('.chat-messages');
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      } catch (err) {
        console.log("Error with manual DOM scroll:", err);
      }
    };

    this._scrollTimeouts.forEach(timeout => clearTimeout(timeout));
    this._scrollTimeouts = [];

    attemptScroll();

    this._scrollTimeouts.push(setTimeout(attemptScroll, 50));
    this._scrollTimeouts.push(setTimeout(attemptScroll, 150));
    this._scrollTimeouts.push(setTimeout(attemptScroll, 300));
    this._scrollTimeouts.push(setTimeout(attemptScroll, 600));
  }


  handleTyping = (e) => {
    this.setState({ input: e.target.value });

    if (!this.state.typing) {
      this.setState({ typing: true });
      this.updateUserTypingStatus(true);
    }

    if (this.state.typingTimeout) clearTimeout(this.state.typingTimeout);

    const timeout = setTimeout(() => {
      this.setState({ typing: false });
      this.updateUserTypingStatus(false);
    }, 2000);

    this.setState({ typingTimeout: timeout });
  } 
  

  updateUserTypingStatus = async (isTyping) => {
    const { messageId } = chatStore;
    const { user } = chatStore;

    if (!messageId) return;
 
    try {
      await updateDoc(doc(db, "messages", messageId), {
        [`typing_${user.id}`]: isTyping
      });
    } catch (error) {
      // console.error("Error updating typing status:", error)
    }
  }

  // Enter key handling
  addEnterKeyListener = () => {
    // Try to find the input element
    const inputElement = document.getElementById('input');
    if (inputElement) {
      console.log("Adding Enter key listener to input element");

      if (!this.handleKeyPress) {
        this.handleKeyPress = (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevent default behavior (like form submission)
            this.sendMes();      // Send the message
          }
        };
      }

      inputElement.addEventListener('keydown', this.handleKeyPress);
    } else {
      console.log("Input element not found, scheduling retry");
      // setTimeout(this.addEnterKeyListener, 500);
    }
  }

  removeEnterKeyListener = () => {
    const inputElement = document.getElementById('input');
    if (inputElement && this.handleKeyPress) {
      inputElement.removeEventListener('keydown', this.handleKeyPress);
    }
  }

  sendMes = async () => {
    try {
      const { user, messageId } = chatStore;
      const { chatUser } = chatStore;
      const { input, previewUrl } = this.state;

      const msg = input.trim();
      const hasMedia = previewUrl && previewUrl.file;

      if ((!msg && !hasMedia) || !messageId) return;

      this.setState({
        input: "",
        previewUrl: null
      });

      this._shouldAutoScroll = true;
      this.scrollToBottom(true);

      const timestamp = serverTimestamp();
      let fileUrl = null;
      let messageType = "text";
      let lastMessagePreview = "";

      if (hasMedia) {
        try {
          const formData = new FormData();
          formData.append('file', previewUrl.file);
          formData.append('upload_preset', import.meta.env.VITE_cloudinary_cloud_prefix);

          const response = await fetch(
            `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_cloudinary_cloud_name}/upload`,
            {
              method: 'POST',
              body: formData
            }
          );

          const data = await response.json();

          if (data.secure_url) {
            fileUrl = data.secure_url;
            messageType = previewUrl.type;

            if (previewUrl.type === 'image') {
              lastMessagePreview = "📷 Image";
            } else if (previewUrl.type === 'video') {
              lastMessagePreview = "🎥 Video";
            } else if (previewUrl.type === 'audio') {
              lastMessagePreview = "🎵 Audio";
            } else {
              lastMessagePreview = "📎 File";
            }
          } else {
            toast.error("File upload failed");
            return;
          }
        } catch (error) {
          toast.error("Error uploading file");
          return;
        }
      } else {
        lastMessagePreview = msg;
      }

      const messageData = {
        sId: user.id,
        createdAt: timestamp,
        read: false,
        type: messageType
      };

      if (chatUser.isGroup) {
        messageData.senderName = user.username;
        messageData.senderProfilePic = user.profilePic;
      }

      if (msg) {
        messageData.text = msg;
      }

      if (fileUrl) {
        messageData.fileUrl = fileUrl;
      }

      await addDoc(collection(db, "messages", messageId, "chatMessages"), messageData);

      this.scrollToBottom(true);
      this._scrollTimeouts.push(setTimeout(() => this.scrollToBottom(true), 100));
      this._scrollTimeouts.push(setTimeout(() => this.scrollToBottom(true), 300));
      this._scrollTimeouts.push(setTimeout(() => this.scrollToBottom(true), 600));

      await updateDoc(doc(db, "messages", messageId), {
        lastActivity: timestamp,
        [`typing_${user.id}`]: false
      });

      let userIds = [];
      if (chatUser.isGroup) {
        userIds = chatUser.members || [];
      } else {
        userIds = [chatUser.rId, user.id];
      }

      for (const id of userIds) {
        const userChatRef = doc(db, "userChats", id);
        const userSnap = await getDoc(userChatRef);

        if (userSnap.exists()) {
          const userChatData = userSnap.data();
          const chatDataClone = [...userChatData.chatData];

          const chatIndex = chatDataClone.findIndex(c => c.messageId === messageId);
          if (chatIndex !== -1) {
            chatDataClone[chatIndex] = {
              ...chatDataClone[chatIndex],
              lastMessage: lastMessagePreview.slice(0, 30) + (lastMessagePreview.length > 30 ? "... " : " ") + "~" + user.username,
              updatedAt: Date.now(),
              messageSeen: id === user.id
            };

            await updateDoc(userChatRef, {
              chatData: chatDataClone
            });
          }
        }
      }
    } catch (error) {
      toast.error("Error sending message");
    }
  }


  markMessagesAsRead = async () => {
    const { messageId, messages, user } = chatStore;

    if (messageId && messages.length > 0 && user) {
      const unreadMessages = messages.filter(msg => !msg.read && msg.sId !== user.id);

      for (const msg of unreadMessages) {
        try {
          if (msg.id) {
            const msgRef = doc(db, "messages", messageId, "chatMessages", msg.id);
            await updateDoc(msgRef, { read: true });
          }
        } catch (error) {
          // Silent error handling
        }
      }
    }
  }

  handleFileSelect = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    this.setState({ filemenu: false });

    const mimeType = file.type.split('/')[0];
    let fileType = mimeType;

    if (mimeType === 'application') {
      fileType = 'file';
    }

    const previewData = {
      type: fileType,
      url: URL.createObjectURL(file),
      file: file,
      name: file.name
    };

    this.setState({ previewUrl: previewData });
  }

  handleBackClick = () => chatStore.setChatUser(null);

  formatLastSeen = (date) => {
    if (!date) return "Offline";

    try {
      const now = new Date();
      const diffInSeconds = Math.floor((now - date) / 1000);

      if (diffInSeconds < 300) {
        return "Just now";
      }

      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      return "Offline";
    }
  }

  toggleFileMenu = () => {
    this.setState(prevState => ({ filemenu: !prevState.filemenu }));
  }

  removePreview = () => {
    this.setState({ previewUrl: null });
  }

  handleResize = () => {
    this.forceUpdate();

    setTimeout(() => this.scrollToBottom(), 100);
  }

  render() {
    const { loading, input, filemenu, previewUrl } = this.state;
    const { user, messages, chatUser } = chatStore;

    // Loading state
    if (loading) {
      return (
        <div className='chat-box loading'>
          <div className="loading-spinner"></div>
          <p>Loading messages...</p>
        </div>
      );
    }

    // Empty state - no chat selected
    if (!chatUser) {
      return (
        <div className='chat-box empty-chat'>
          <div className="welcome-container">
            <img src={assets.logo_big || assets.avatar_icon} alt="Logo" className="welcome-logo" />
            <h2>Welcome to Chat App</h2>
            <p>Select a conversation to start chatting</p>
          </div>
        </div>
      );
    }

    // Render chat interface
    return (
      <div className='chat-box'>
        {/* Chat header */}
        <div className="chat-user">
          <img src={assets.arrow_icon} alt="Back" className="back-btn" onClick={this.handleBackClick} />
          <div className="user-info">
            {chatUser.isGroup ? (
              // Group chat header
              <>
                <img src={chatUser.groupImage || assets.logo_icon} alt="" />
                <div className="user-status">
                  <p>{chatUser.groupName}</p>
                  <span className="status">
                    <span>{chatUser.members?.length || 0} members</span>
                  </span>
                </div>
              </>
            ) : (
              // Direct message header
              <>
                <img src={chatUser?.user?.profilePic || assets.profile_img} alt="" />
                <div className="user-status">
                  <p>{chatUser?.user?.username || "Unknown User"}</p>
                  <span className="status">
                    {chatUser?.user?.isOnline ? (
                      <>
                        <span className="status-dot online"></span>
                        <span>Online</span>
                      </>
                    ) : (
                      <>
                        <span className="status-dot offline"></span>
                        <span>{chatUser?.user?.lastSeen ? this.formatLastSeen(chatUser.user.lastSeen) : "Offline"}</span>
                      </>
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
          <img src={assets.help_icon} alt="" className='call-icon' />
        </div>

        {/* Messages area */}
        <div className="chat-messages">
          <Virtuoso
            ref={this.virtuosoRef}
            data={messages}
            itemContent={(index, msg) => (
              <MessageRow
                index={index}
                data={{
                  messages,
                  user,
                  chatUser,
                  assets,
                  formatLastSeen: this.formatLastSeen,
                }}
              />
            )}
            style={{ height: window.innerHeight - 220 }}
            followOutput="auto"
            alignToBottom={true}
            initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
            defaultItemHeight={100}
            overscan={500}
            atBottomStateChange={(isAtBottom) => {
              this._isAtBottom = isAtBottom;
              if (isAtBottom) {
                this._shouldAutoScroll = true;
              }
            }}
            stick
            components={{
              Footer: () => <div ref={this.messagesEndRef} style={{ height: 20 }} />
            }}
          />
          {/* Typing indicator */}
          {chatUser?.typing && (
            <div className="typing-indicator r-msg">
              <div className="dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="chat-input">
          {previewUrl && (
            <div className="preview-container">
              <div className="preview-content">
                {previewUrl.type === 'image' && (
                  <img src={previewUrl.url} alt="Preview" className="preview-image" />
                )}

                {previewUrl.type === 'video' && (
                  <video src={previewUrl.url} controls className="video-preview">
                    Your browser does not support video playback.
                  </video>
                )}

                {previewUrl.type === 'audio' && (
                  <audio src={previewUrl.url} controls className="preview-audio">
                    Your browser does not support audio playback.
                  </audio>
                )}

                {previewUrl.type === 'file' && (
                  <div className="preview-file">
                    <FaFile style={{ marginRight: '8px', color: 'var(--primary)' }} />
                    {previewUrl.file.name}
                  </div>
                )}

                <button className="remove-preview" onClick={this.removePreview}>
                  <FaTimes /> Remove
                </button>
              </div>
            </div>
          )}

          <div className='relative'>
            <ImAttachment
              className='attachment-icon cursor-pointer'
              onClick={this.toggleFileMenu}
            />
            {filemenu && (
              <div className="attachment-menu">
                <label className="attachment-option">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => this.handleFileSelect(e, 'image')}
                    style={{ display: 'none' }}
                  />
                  <FaImage className="attachment-icon-inner" />
                  <span>Image</span>
                </label>
                <label className="attachment-option">
                  <input
                    type="file"
                    accept="application/*,audio/*,video/*"
                    onChange={(e) => this.handleFileSelect(e, 'file')}
                    style={{ display: 'none' }}
                  />
                  <FaFile className="attachment-icon-inner" />
                  <span>File</span>
                </label>
              </div>
            )}
          </div>
          <input
            type="text"
            placeholder='Send a message'
            onChange={this.handleTyping}
            value={input}
            id='input'
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMes();
              }
            }}
          />
          <img
            src={assets.send_button}
            alt=""
            onClick={this.sendMes}
            className={input.trim() || previewUrl ? 'active' : ''}
          />
        </div>
      </div>
    );
  }
}

// MessageRow component remains the same
const MessageRow = ({ index, data }) => {
  const { messages, user, chatUser, assets } = data;
  const msg = messages[index];
  const isCurrentUser = msg.sId === user?.id;
  const messageClass = isCurrentUser ? 'sender' : 'receiver';

  // Date header logic 
  let showDateHeader = false;
  if (index === 0) showDateHeader = true;
  else {
    const prevMsg = messages[index - 1];
    const prevDate = prevMsg.createdAt?.toDate
      ? new Date(prevMsg.createdAt.toDate()).toDateString()
      : new Date().toDateString();
    const currDate = msg.createdAt?.toDate
      ? new Date(msg.createdAt.toDate()).toDateString()
      : new Date().toDateString();
    if (prevDate !== currDate) showDateHeader = true;
  }

  return (
    <div className="message-row">
      {showDateHeader && (
        <div className="date-header">
          <span>
            {msg.createdAt?.toDate
              ? new Date(msg.createdAt.toDate()).toLocaleDateString()
              : new Date().toLocaleDateString()}
          </span>
        </div>
      )}

      {msg.system ? (
        <div className="system-message-container">
          <div className="system-message">
            <p>{msg.text}</p>
          </div>
        </div>
      ) : (
        <div className={`message-container ${isCurrentUser ? 'sender-container' : 'receiver-container'}`}>
          <div className={`message-bubble ${isCurrentUser ? 'sender-bubble' : ''} ${messageClass}`}>
            <div className="message-content">
              {chatUser.isGroup && !isCurrentUser && (
                <div className="message-sender-name">
                  <span>{msg.senderName || "Unknown User"}</span>
                </div>
              )}

              {msg.type === 'image' && msg.fileUrl && (
                <div className="img-msg">
                  <img
                    src={msg.fileUrl}
                    alt="Image"
                    onClick={() => window.open(msg.fileUrl, '_blank')}
                  />
                </div>
              )}

              {msg.type === 'video' && msg.fileUrl && (
                <div className="video-msg">
                  <video src={msg.fileUrl} controls></video>
                </div>
              )}

              {msg.type === 'audio' && msg.fileUrl && (
                <div className="audio-msg">
                  <audio src={msg.fileUrl} controls></audio>
                </div>
              )}

              {msg.fileUrl && !['image', 'video', 'audio'].includes(msg.type) && (
                <div className="file-msg">
                  <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">
                    <FaFile /> Download File
                  </a>
                </div>
              )}

              {msg.text && <p>{msg.text}</p>}
            </div>

            <img
              className="message-avatar"
              src={isCurrentUser
                ? (user?.profilePic || assets.profile_img)
                : (chatUser.isGroup
                  ? (msg.senderProfilePic || assets.profile_img)
                  : (chatUser.user?.profilePic || assets.profile_img))}
              alt=""
            />
          </div>

          <div className={`message-time ${messageClass}`}>
            {msg.createdAt?.toDate
              ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
            {isCurrentUser && (
              <span className={`read-status ${msg.read ? 'read' : 'unread'}`}>
                {msg.read ? '✓✓' : '✓'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default observer(ChatBox);