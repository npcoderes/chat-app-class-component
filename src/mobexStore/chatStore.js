import { makeAutoObservable, runInAction } from "mobx";
import { db } from "../config/firebase";
import { doc, getDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";

class ChatStore {
  user = null;
  chatData = [];
  messageId = null;
  messages = [];
  chatUser = null;
  unreadMessages = {};
  statusListeners = [];

  constructor() {
    makeAutoObservable(this);
  }

  setUser(user) {
    this.user = user;
    if (user?.id) {
      this.setOnlineStatus();
    }
  }

  setChatData(chatData) {
    this.chatData = chatData;
  }

  setMessageId(id) {
    this.messageId = id;
  }

  setMessages(messages) {
    this.messages = messages;
  }

  setChatUser(user) {
    this.chatUser = user;  // This is the correct way in MobX
  }

  setUnreadMessages(messages) {
    this.unreadMessages = messages;
  }

  // Improved online status management
  setOnlineStatus = async () => {
    if (!this.user?.id) return;

    try {
      // Update user status to online immediately
      const userStatusRef = doc(db, "userStatus", this.user.id);
      await setDoc(userStatusRef, {
        online: true,
        lastSeen: new Date(),
      }, { merge: true });

      // Set up event listeners if not already set
      if (!this._onlineStatusInitialized) {
        // Handle page visibility changes
        document.addEventListener('visibilitychange', this._handleVisibilityChange);

        // Handle beforeunload (when user closes browser)
        window.addEventListener('beforeunload', this._handleBeforeUnload);

        // Set up periodic pings to maintain online status
        this._pingInterval = setInterval(() => {
          if (this.user?.id) {
            updateDoc(userStatusRef, {
              lastSeen: new Date(),
            }).catch(err => console.log("Error updating last seen"));
          }
        }, 30000);

        this._onlineStatusInitialized = true;
      }
    } catch (error) {
      console.error("Error setting online status:", error);
    }
  }

  // Handle visibility change (tab focus/blur)
  _handleVisibilityChange = async () => {
    if (!this.user?.id) return;

    const userStatusRef = doc(db, "userStatus", this.user.id);

    try {
      if (document.visibilityState === 'visible') {
        // User has returned to the tab
        await updateDoc(userStatusRef, {
          online: true,
          lastSeen: new Date()
        });
      } else {
        // User has left the tab
        await updateDoc(userStatusRef, {
          online: false,
          lastSeen: new Date()
        });
      }
    } catch (error) {
      console.error("Error updating visibility status:", error);
    }
  }

  // Handle page close/refresh
  _handleBeforeUnload = async () => {
    if (!this.user?.id) return;

    try {
      const userStatusRef = doc(db, "userStatus", this.user.id);
      await updateDoc(userStatusRef, {
        online: false,
        lastSeen: new Date()
      });
    } catch (error) {
      console.error("Error updating offline status on unload:", error);
    }
  }

  // Clean up all listeners and mark user as offline
  cleanupOnlineStatus = async () => {
    if (!this.user?.id) return;

    try {
      // Remove event listeners
      document.removeEventListener('visibilitychange', this._handleVisibilityChange);
      window.removeEventListener('beforeunload', this._handleBeforeUnload);

      if (this._pingInterval) {
        clearInterval(this._pingInterval);
        this._pingInterval = null;
      }

      // Update user status to offline
      const userStatusRef = doc(db, "userStatus", this.user.id);
      await updateDoc(userStatusRef, {
        online: false,
        lastSeen: new Date()
      });

      this._onlineStatusInitialized = false;
    } catch (error) {
      console.error("Error cleaning up online status:", error);
    }
  }

  async loadUserData(uid) {
    try {
      const userRef = doc(db, "users", uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        runInAction(() => {
          this.user = {
            ...userData,
            id: uid
          };
        });
        // Setup chat listeners after user is loaded
        this.setupChatListeners();
      } else {
        console.error("No user found with this ID");
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  }

  setupChatListeners() {
    if (!this.user?.id) return;

    const chatRef = doc(db, "userChats", this.user.id);

    const unsubscribe = onSnapshot(chatRef, async (snapshot) => {
      if (!snapshot.exists()) return;

      const chats = snapshot.data().chatData || [];
      const newUnreadMessages = {};

      const validChats = chats.filter(chatItem =>
        chatItem.rId && chatItem.messageId && chatItem.updatedAt
      );

      validChats.forEach(chatItem => {
        if (!chatItem.messageSeen && chatItem.lastMessage) {
          newUnreadMessages[chatItem.messageId] = true;
        }
      });

      const userPromises = validChats.map(chatItem =>
        Promise.all([
          getDoc(doc(db, "users", chatItem.rId)).catch(() => null),
          getDoc(doc(db, "userStatus", chatItem.rId)).catch(() => null)
        ])
      );

      const results = await Promise.all(userPromises);

      const enrichedData = results.map(([userDoc, statusDoc], index) => {
        const chatItem = validChats[index];
        let userData = { id: chatItem.rId, displayName: "Unknown User" };

        if (userDoc?.exists()) {
          userData = userDoc.data();
          if (!userData.displayName) userData.displayName = "Unknown User";
        }

        const isOnline = statusDoc?.exists() ? statusDoc.data().online : false;
        const lastSeen = statusDoc?.exists() ? statusDoc.data().lastSeen?.toDate() : null;

        return {
          ...chatItem,
          user: {
            ...userData,
            id: chatItem.rId,
            isOnline,
            lastSeen
          }
        };
      }).filter(Boolean);

      const sortedData = enrichedData.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() ?? new Date(a.updatedAt).getTime?.() ?? 0;
        const bTime = b.updatedAt?.toMillis?.() ?? new Date(b.updatedAt).getTime?.() ?? 0;
        return bTime - aTime;
      });

      this.setChatData(sortedData);
      this.setUnreadMessages(newUnreadMessages);
    });

    this.chatSnap = unsubscribe;
  }

  cleanupChatListener() {
    if (this.chatSnap && typeof this.chatSnap === 'function') {
      this.chatSnap();
      this.chatSnap = null;
    }
  }

  cleanup() {
    this.cleanupOnlineStatus?.();
  }

  // Add this method to your chatStore class
  logoutCleanup = async () => {
    // First set user offline
    await this.cleanupOnlineStatus();

    // Clean up chat listeners
    this.cleanupChatListener();

    // Reset all state
    runInAction(() => {
      this.user = null;
      this.chatData = [];
      this.messageId = null;
      this.messages = [];
      this.chatUser = null;
      this.unreadMessages = {};
    });
  }
}

// Create a single instance of the store
const chatStore = new ChatStore();
export default chatStore;