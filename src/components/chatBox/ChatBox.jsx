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

    // Initialize store value tracking
    this.prevStoreValues = {
      messageId: null,
      chatUserId: null,
      messagesLength: 0
    };
  }

  // Component lifecycle methods
  componentDidMount() {
    this.addEnterKeyListener();
  }

  componentDidUpdate(prevProps, prevState) {
    const { messageId, chatUser, messages, user } = chatStore;

    // Store previous values to compare
    if (!this.prevStoreValues) {
      this.prevStoreValues = {
        messageId: null,
        chatUserId: null,
        messagesLength: 0
      };
    }

    // Check if messageId changed to set up message listeners
    if (messageId !== this.prevStoreValues.messageId && messageId) {
      this.setupMessageListeners();
      this.prevStoreValues.messageId = messageId;
    }

    // Check if chatUser.user.id changed to set up status listeners
    if (chatUser?.user?.id !== this.prevStoreValues.chatUserId && chatUser?.user?.id) {
      this.setupUserStatusListener();
      this.prevStoreValues.chatUserId = chatUser?.user?.id;
    }

    // Auto-scroll when messages change
    if (messages.length !== this.prevStoreValues.messagesLength && messages.length > 0) {
      this.scrollToBottom();
      this.prevStoreValues.messagesLength = messages.length;
    }

    // Mark messages as read when messages change or messageId changes
    if ((messages.length !== this.prevStoreValues.messagesLength ||
      messageId !== this.prevStoreValues.messageId) &&
      messages.length > 0 && user) {
      this.markMessagesAsRead();
    }
  }

  componentWillUnmount() {
    // Clean up all listeners
    if (this.unsubMessages) this.unsubMessages();
    if (this.unsubTyping) this.unsubTyping();
    if (this.unsubStatus) this.unsubStatus();
    this.removeEnterKeyListener();

    // Clear any timers
    if (this.state.typingTimeout) {
      clearTimeout(this.state.typingTimeout);
    }
  }

  // Set up message listeners
  setupMessageListeners = () => {
    const { messageId } = chatStore;
    const { chatUser } = chatStore;

    // Set loading only if not already loading
    if (!this.state.loading) {
      this.setState({ loading: true });
    }

    // Query messages from subcollection ordered by timestamp
    const chatMessagesRef = collection(db, 'messages', messageId, 'chatMessages');
    const q = query(chatMessagesRef, orderBy('createdAt', 'asc'));

    // Unsubscribe from previous listeners if they exist
    if (this.unsubMessages) this.unsubMessages();
    if (this.unsubTyping) this.unsubTyping();

    this.unsubMessages = onSnapshot(q, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      chatStore.setMessages(messagesData);
      this.setState({ loading: false });
    });

    // Get typing indicators from the main document
    this.unsubTyping = onSnapshot(doc(db, 'messages', messageId), (doc) => {
      if (doc.exists() && chatUser?.rId) {
        const typingStatus = doc.data()[`typing_${chatUser.rId}`];
        // Do something with the typing status if needed
      }
    });
  }

  // Set up user status listener
  setupUserStatusListener = () => {
    const { chatUser } = chatStore;

    if (this.unsubStatus) this.unsubStatus();

    const userStatusRef = doc(db, "userStatus", chatUser.user.id);
    this.unsubStatus = onSnapshot(userStatusRef, (doc) => {
      if (doc.exists()) {
        // Create a new object to update with
        const updatedUser = {
          ...chatUser,
          user: {
            ...chatUser.user,
            isOnline: doc.data().online || false,
            lastSeen: doc.data().lastSeen ? doc.data().lastSeen.toDate() : null
          }
        };

        // Use the store method to update the user
        chatStore.setChatUser(updatedUser);
      }
    });
  }

  // Auto-scroll to bottom of messages
  scrollToBottom = () => {
    this.messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // Handle typing indicator
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

  // Add enter key listener for sending message
  addEnterKeyListener = () => {
    const inputElement = document.getElementById('input');
    if (inputElement) {
      this.handleKeyPress = (e) => {
        if (e.key === 'Enter') {
          this.sendMes();
        }
      };
      inputElement.addEventListener('keydown', this.handleKeyPress);
    }
  }

  // Remove enter key listener
  removeEnterKeyListener = () => {
    const inputElement = document.getElementById('input');
    if (inputElement && this.handleKeyPress) {
      inputElement.removeEventListener('keydown', this.handleKeyPress);
    }
  }

  // Send message - Updated to handle both direct and group chats
  sendMes = async () => {
    try {
      const { user, messageId } = chatStore;
      const { chatUser } = chatStore;
      const { input, previewUrl } = this.state;

      const msg = input.trim();
      const hasMedia = previewUrl && previewUrl.file;

      // Validate if there's something to send
      if ((!msg && !hasMedia) || !messageId) return;

      const timestamp = serverTimestamp();
      let fileUrl = null;
      let messageType = "text";
      let lastMessagePreview = "";

      // Handle file upload if present
      if (hasMedia) {
        try {
          // Upload file to Cloudinary
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

            // Set appropriate preview text based on file type
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
          // console.error("Error uploading file:", error);
          toast.error("Error uploading file");
          return;
        }
      } else {
        // If no media, use the text message for preview
        lastMessagePreview = msg;
      }

      // Create message object based on what we're sending
      const messageData = {
        sId: user.id,
        createdAt: timestamp,
        read: false,
        type: messageType
      };

      // Add sender info for group chats
      if (chatUser.isGroup) {
        messageData.senderName = user.username;
        messageData.senderProfilePic = user.profilePic;
      }

      // Only add text if there is text to send
      if (msg) {
        messageData.text = msg;
      }

      // Only add fileUrl if there's a file
      if (fileUrl) {
        messageData.fileUrl = fileUrl;
      }

      // Add message to chatMessages subcollection
      await addDoc(collection(db, "messages", messageId, "chatMessages"), messageData);

      // Reset states
      this.setState({
        input: "",
        previewUrl: null
      });

      // Update last activity timestamp on parent document
      await updateDoc(doc(db, "messages", messageId), {
        lastActivity: timestamp,
        [`typing_${user.id}`]: false
      });

      // Update chat status for all users
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
              lastMessage: lastMessagePreview.slice(0, 30) + "... " + " ~" + user.username,
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
      // console.error("Error sending message:", error);
      toast.error("Error sending message");
    }
  }

  // Mark messages as read
  markMessagesAsRead = async () => {
    const { messageId, messages, user } = chatStore;

    if (messageId && messages.length > 0 && user) {
      const unreadMessages = messages.filter(msg => !msg.read && msg.sId !== user.id);

      // Update each unread message document
      for (const msg of unreadMessages) {
        try {
          if (msg.id) {
            const msgRef = doc(db, "messages", messageId, "chatMessages", msg.id);
            await updateDoc(msgRef, { read: true });
          }
        } catch (error) {
          // console.error("Error marking message as read:", error);
        }
      }
    }
  }

  // Handle file selection
  handleFileSelect = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    // Close file menu
    this.setState({ filemenu: false });

    // Determine the actual file type based on MIME type
    const mimeType = file.type.split('/')[0];
    let fileType = mimeType;

    // Handle special case for application type
    if (mimeType === 'application') {
      fileType = 'file';
    }

    // Create preview URL for the file
    const previewData = {
      type: fileType,
      url: URL.createObjectURL(file),
      file: file,
      name: file.name
    };

    this.setState({ previewUrl: previewData });
  }

  // Handle back button click
  handleBackClick = () => chatStore.setChatUser(null);

  // Format last seen time
  formatLastSeen = (date) => {
    if (!date) return "Offline";
    return formatDistanceToNow(date, { addSuffix: true });
  }

  // Toggle file menu
  toggleFileMenu = () => {
    this.setState(prevState => ({ filemenu: !prevState.filemenu }));
  }

  // Remove preview
  removePreview = () => {
    this.setState({ previewUrl: null });
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
          {(() => {
            let currentDate = null;
            const messageElements = [];

            messages.forEach((msg, index) => {
              const isCurrentUser = msg.sId === user?.id;

              // Check if this is a new date
              const messageDate = msg.createdAt?.toDate ?
                new Date(msg.createdAt.toDate()).toDateString() :
                new Date().toDateString();

              if (currentDate !== messageDate) {
                currentDate = messageDate;
                messageElements.push(
                  <div className="date-header" key={`date-${messageDate}`}>
                    <span>{msg.createdAt?.toDate ?
                      new Date(msg.createdAt.toDate()).toLocaleDateString() :
                      new Date().toLocaleDateString()}
                    </span>
                  </div>
                );
              }

              // Handle system messages differently from regular messages
              if (msg.system) {
                messageElements.push(
                  <div className="system-message-container" key={`msg-${msg.id || index}`}>
                    <div className="system-message">
                      <p>{msg.text}</p>
                    </div>
                  </div>
                );
              } else {
                // Regular message (sent or received)
                messageElements.push(
                  <div className={isCurrentUser ? "s-msg" : "r-msg"} key={`msg-${msg.id || index}`}>
                    {/* Show sender name for group messages */}
                    {chatUser.isGroup && !isCurrentUser && (
                      <div className="message-sender-name">
                        <span>{msg.senderName || "Unknown User"}</span>
                      </div>
                    )}

                    {/* Image Message */}
                    {msg.type === 'image' && msg.fileUrl && (
                      <div className="msg img-msg">
                        <img
                          src={msg.fileUrl}
                          alt="Image"
                          onClick={() => window.open(msg.fileUrl, '_blank')}
                        />
                      </div>
                    )}

                    {/* Video Message */}
                    {msg.type === 'video' && msg.fileUrl && (
                      <div className="msg video-msg">
                        <video src={msg.fileUrl} controls></video>
                      </div>
                    )}

                    {/* Audio Message */}
                    {msg.type === 'audio' && msg.fileUrl && (
                      <div className="msg audio-msg">
                        <audio src={msg.fileUrl} controls></audio>
                      </div>
                    )}

                    {/* File Message */}
                    {msg.fileUrl && !['image', 'video', 'audio'].includes(msg.type) && (
                      <div className="msg file-msg">
                        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">
                          <FaFile /> Download File
                        </a>
                      </div>
                    )}

                    {/* Text Message */}
                    {msg.text && <p className='msg'>{msg.text}</p>}

                    {/* Message Footer */}
                    <div>
                      <img
                        src={isCurrentUser
                          ? (user?.profilePic || assets.profile_img)
                          : (chatUser.isGroup
                            ? (msg.senderProfilePic || assets.profile_img)
                            : (chatUser.user?.profilePic || assets.profile_img))}
                        alt=""
                      />
                      <p className='time'>
                        {msg.createdAt?.toDate ?
                          msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) :
                          new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        }
                        {isCurrentUser && (
                          <span className={`read-status ${msg.read ? 'read' : 'unread'}`}>
                            {msg.read ? '✓✓' : '✓'}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              }
            });

            return messageElements;
          })()}

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
          <div ref={this.messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="chat-input">
          {
            previewUrl && (
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
            )
          }

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

export default observer(ChatBox);