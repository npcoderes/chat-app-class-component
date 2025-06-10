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

  setOnlineStatus() {
    if (!this.user?.id) return;

    const userStatusRef = doc(db, "userStatus", this.user.id);
    setDoc(userStatusRef, {
      online: true,
      lastSeen: new Date(),
    }, { merge: true });

    const handleUnload = () => {
      updateDoc(userStatusRef, {
        online: false,
        lastSeen: new Date(),
      });
    };

    window.addEventListener('beforeunload', handleUnload);

    const pingInterval = setInterval(() => {
      updateDoc(userStatusRef, {
        lastSeen: new Date(),
      });
    }, 30000);

    this.cleanupOnlineStatus = () => {
      window.removeEventListener('beforeunload', handleUnload);
      clearInterval(pingInterval);
      updateDoc(userStatusRef, {
        online: false,
        lastSeen: new Date(),
      });
    };
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
}

// Create a single instance of the store
const chatStore = new ChatStore();
export default chatStore;