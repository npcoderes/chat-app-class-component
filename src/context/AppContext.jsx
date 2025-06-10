import { createContext, useEffect, useState } from "react";
import { db } from "../config/firebase";
import { doc, getDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";

export const AppContext = createContext();

const AppContextProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [chatData, setChatData] = useState([]);
  const [messageId, setMessageId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatUser, setChatUser] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState({});

  // Set user online status
  useEffect(() => {
    if (user?.id) {
      const userStatusRef = doc(db, "userStatus", user.id);
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

      return () => {
        window.removeEventListener('beforeunload', handleUnload);
        clearInterval(pingInterval);
        updateDoc(userStatusRef, {
          online: false,
          lastSeen: new Date(),
        });
      };
    }
  }, [user?.id]);

  const loadUserData = async (uid) => {
    try {
      const userRef = doc(db, "users", uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUser({
          ...userData,
          id: uid
        });
      } else {
        console.error("No user found with this ID");
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  // Track chat data and unread messages
  useEffect(() => {
    if (user) {
      const chatRef = doc(db, "userChats", user.id);
      const chatSnep = onSnapshot(chatRef, async (snapshot) => {
        if (snapshot.exists()) {
          const chats = snapshot.data().chatData || [];
          const newUnreadMessages = {};

          // Track unread messages
          chats.forEach(chatItem => {
            if (!chatItem.messageId || !chatItem.rId) {
              console.warn("Invalid chat item:", chatItem);
              return;
            }
            if (!chatItem.messageSeen && chatItem.lastMessage) {
              newUnreadMessages[chatItem.messageId] = true;
            }
          });

          // Batch fetch user data and status
          const userPromises = chats.map(chatItem =>
            Promise.all([
              getDoc(doc(db, "users", chatItem.rId)).catch(() => null),
              getDoc(doc(db, "userStatus", chatItem.rId)).catch(() => null)
            ])
          );
          const results = await Promise.all(userPromises);

          const tempData = results.map(([userDoc, statusDoc], index) => {
            const chatItem = chats[index];
            if (!chatItem.rId || !chatItem.messageId || !chatItem.updatedAt) {
              console.warn("Skipping invalid chat item:", chatItem);
              return null;
            }
            let userData = { id: chatItem.rId, displayName: "Unknown User" };
            if (userDoc && userDoc.exists()) {
              userData = userDoc.data();
              if (!userData.displayName) {
                console.warn(`Missing displayName for user ${chatItem.rId}`);
                userData.displayName = "Unknown User";
              }
            } else {
              console.warn(`User document not found for rId: ${chatItem.rId}`);
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

          // Sort and update state
          const sortedData = tempData.sort((a, b) => b.updatedAt - a.updatedAt);
          setChatData(sortedData);
          setUnreadMessages(newUnreadMessages);

          // Set up real-time status listeners
          const statusUnsubscribes = chats.map(chatItem => {
            if (!chatItem.rId) return () => {};
            return onSnapshot(doc(db, "userStatus", chatItem.rId), statusDoc => {
              setChatData(prev => {
                return prev.map(item => {
                  if (!item.rId || !item.user) {
                    console.warn("Invalid item in chatData:", item);
                    return item;
                  }
                  if (item.rId === chatItem.rId) {
                    return {
                      ...item,
                      user: {
                        ...item.user,
                        isOnline: statusDoc.exists() ? statusDoc.data().online : false,
                        lastSeen: statusDoc.exists() ? statusDoc.data().lastSeen?.toDate() : null
                      }
                    };
                  }
                  return item;
                });
              });
            }, err => console.error(`Status listener error for ${chatItem.rId}:`, err));
          });

          return () => {
            statusUnsubscribes.forEach(unsub => unsub());
          };
        }
      }, err => console.error("Chat listener error:", err));

      return () => chatSnep();
    }
  }, [user]);

  const value = {
    user,
    setUser,
    chatData,
    setChatData,
    loadUserData,
    messageId,
    setMessageId,
    messages,
    setMessages,
    chatUser,
    setChatUser,
    unreadMessages,
    setUnreadMessages
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export default AppContextProvider;