import React, { Component } from 'react'
import "./LeftSidebar.css";
import assets from '../../assets/assets';
import { db, LogOutUser } from '../../config/firebase';
import { Link } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, arrayUnion, addDoc, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { IoMdMenu } from 'react-icons/io';
import { formatDistanceToNow, set } from 'date-fns';
import { Button, Modal, Input, Form, Upload, Avatar, Select, Spin, Tabs, List, Tag, Popconfirm } from 'antd';
import { PlusOutlined, UserOutlined, SettingOutlined, EditOutlined, UserAddOutlined, DeleteOutlined, TeamOutlined } from '@ant-design/icons';
import chatStore from '../../mobexStore/chatStore';
import { observer } from 'mobx-react';

export class LeftSidebar extends Component {
  constructor(props) {
    super(props);

    // Ant Design Forms
    this.formRef = React.createRef();
    this.groupEditFormRef = React.createRef();

    // Initialize state
    this.state = {
      searchUser: null,
      search: false,
      searchLoading: false,
      noUserFound: false,
      searchQuery: "",

      groupModalOpen: false,
      chatDataGroup: [],
      groupSettingsVisible: false,
      activeGroup: null,
      groupMembers: [],
      isLoadingMembers: false,

      groupEditMode: false,
      addMemberMode: false,

      groupImage: null,
      selectedMembers: [],
      userSearchResults: [],
      searchingUsers: false,
      imageUrl: null,

      user: chatStore.user,
    };
    this.unsubscribeChatListener = null;
    this.createGroup = this.createGroup.bind(this);
    this.handleOpenGroupSettings = this.handleOpenGroupSettings.bind(this);
    this.handleUpdateGroup = this.handleUpdateGroup.bind(this);
    this.searchUsers = this.searchUsers.bind(this);
    this.addMembersToGroup = this.addMembersToGroup.bind(this);


  }

  handleImageChange(info) {
    this.setState({
      groupImage: info.file,
      imageUrl: URL.createObjectURL(info.file)
    })
  }


  handleModalClose = () => {
    if (this.formRef.current) {
      this.formRef.current.resetFields();
    }

    this.setState({
      selectedMembers: [],
      groupImage: null,
      imageUrl: null,
      groupModalOpen: false,
    });
  };

  async searchUsers(value) {
    const { user } = chatStore;
    if (!value.trim()) {
      this.setState({
        userSearchResults: [],
        searchingUsers: false,
      });
      return;
    }

    this.setState({
      searchingUsers: true,
      userSearchResults: [],
    });
    try {
      const usersRef = collection(db, "users");
      const userQuery = query(usersRef,
        where("username", ">=", value.toLowerCase()),
        where("username", "<=", value.toLowerCase() + '\uf8ff')
      );

      const querySnapshot = await getDocs(userQuery);

      const results = [];
      querySnapshot.forEach((doc) => {
        // Don't include current user or already selected users
        if (doc.id !== user.id) {
          results.push({
            value: doc.id,
            label: doc.data().username,
            data: {
              id: doc.id,
              ...doc.data()
            }
          });
        }
      });

      this.setState({
        userSearchResults: results,
      })
    } catch (error) {
      // console.error("Error searching users:", error);
      toast.error("Error searching users");
    } finally {
      this.setState({
        searchingUsers: false,
      });
    }
  }

  async createGroup(values) {
    const { groupName, groupDescription } = values;
    const { groupImage, selectedMembers, user } = this.state;
    console.log("Creating group with values:", values);
    console.log("Selected members:", selectedMembers);

    if (!groupName?.trim() || selectedMembers.length === 0) {
      toast.error("Group name and at least one member are required");
      return;
    }

    const loadingToast = toast.loading("Creating group...");

    try {
      // First, upload the image to Cloudinary if provided
      let groupImageUrl = null;
      if (this.state.groupImage) {
        const formData = new FormData();
        formData.append('file', groupImage);
        formData.append('upload_preset', import.meta.env.VITE_cloudinary_cloud_prefix);

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_cloudinary_cloud_name}/upload`,
          {
            method: 'POST',
            body: formData
          }
        );

        const imageData = await response.json();
        if (imageData.secure_url) {
          groupImageUrl = imageData.secure_url;
        }
      }

      // Create message document for the group
      const messageRef = doc(collection(db, "messages"));
      const messageId = messageRef.id;

      // Set basic group info
      await setDoc(messageRef, {
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
        isGroup: true,
        groupName,
        groupDescription: groupDescription || "",
        groupImage: groupImageUrl,
        createdBy: user.id,
        members: [user.id, ...selectedMembers],
        admins: [user.id]
      });

      // Add initial system message
      await addDoc(collection(db, "messages", messageId, "chatMessages"), {
        system: true,
        text: `${user.username} created the group "${groupName}"`,
        createdAt: serverTimestamp()
      });

      // Add group to creator's chat list
      await this.updateUserChatList(user.id, {
        messageId,
        isGroup: true,
        groupName,
        groupImage: groupImageUrl,
        members: [user.id, ...selectedMembers],
        lastMessage: "Group created",
        updatedAt: Date.now(),
        messageSeen: true
      });

      // Add group to each member's chat list
      for (const memberId of selectedMembers) {
        await this.updateUserChatList(memberId, {
          messageId,
          isGroup: true,
          groupName,
          groupImage: groupImageUrl,
          members: [user.id, ...selectedMembers],
          lastMessage: `${user.username} added you to the group`,
          updatedAt: Date.now(),
          messageSeen: false,

        });
      }

      toast.dismiss(loadingToast);
      toast.success("Group created successfully");
      this.handleModalClose();

    } catch (error) {
      console.error("Error creating group:", error);
      toast.dismiss(loadingToast);
      toast.error("Failed to create group");
    }
  }

  async updateUserChatList(userId, groupChatData) {
    const userChatRef = doc(db, "userChats", userId);
    const userChatDoc = await getDoc(userChatRef);

    if (userChatDoc.exists()) {
      // Add to existing chatData array
      await updateDoc(userChatRef, {
        chatData: arrayUnion(groupChatData)
      });
    } else {
      // Create new chatData array
      await setDoc(userChatRef, {
        chatData: [groupChatData]
      });
    }
  }

  async handleSearch(e) {
    const value = e.target.value;
    const { chatData } = chatStore;
    console.log("Search value:", value);
    this.setState({ searchQuery: value });

    if (value.trim() === "") {
      this.setState({
        searchUser: null,
        search: false,
        searchLoading: false,
        noUserFound: false
      });
      return;
    }

    this.setState({ searchLoading: true, search: true });
    try {
      const userRef = collection(db, "users");
      const q = query(userRef, where("username", "==", value.trim().toLowerCase()));
      const result = await getDocs(q);

      if (result.empty) {
        this.setState({
          searchUser: null,
          noUserFound: true,
        });
        return;
      } else {
        const foundUser = result.docs[0].data();
        foundUser.id = result.docs[0].id;

        // Check if user is already in a chat using the MobX store's chatData
        const alreadyInChat = chatData.some(item => item.rId === foundUser.id);
        this.setState({
          searchUser: alreadyInChat ? null : foundUser,
          noUserFound: alreadyInChat
        })
      }
    } catch (error) {
      console.error("Search error:", error);
      this.setState({
        searchUser: null,
        noUserFound: true,
      });
    } finally {
      this.setState({ searchLoading: false });
    }
  }

  async addChat(ruser) {
    const { user } = chatStore
    const tid = toast.loading("Adding chat...");

    try {
      // Check if chat exists
      const existingChatDoc = await getDoc(doc(db, "userChats", user.id));
      const existingChats = existingChatDoc.exists() ? existingChatDoc.data().chatData || [] : [];

      if (existingChats.some(chat => chat.rId === ruser.id)) {
        toast.dismiss(tid);
        return;
      }

      // Create message document
      const messageRef = collection(db, "messages");
      const newMessage = doc(messageRef);
      await setDoc(newMessage, {
        createdAt: serverTimestamp(),
      });

      // Add chat for recipient
      const recipientDoc = await getDoc(doc(db, "userChats", ruser.id));
      const recipientChats = recipientDoc.exists() ? recipientDoc.data().chatData || [] : [];
      await setDoc(doc(db, "userChats", ruser.id), {
        chatData: [
          ...recipientChats,
          {
            messageId: newMessage.id,
            rId: user.id,
            lastMessage: "",
            updatedAt: Date.now(),
            messageSeen: true,
          }
        ]
      });

      // Add chat for current user
      await setDoc(doc(db, "userChats", user.id), {
        chatData: [
          ...existingChats,
          {
            messageId: newMessage.id,
            rId: ruser.id,
            lastMessage: "",
            updatedAt: Date.now(),
            messageSeen: true,
          }
        ]
      });

      this.setState({
        searchUser: null,
        searchQuery: "",
        search: false,
        noUserFound: false,
      })
      toast.dismiss(tid);
      toast.success("Chat added successfully");
    } catch (error) {
      toast.dismiss(tid);
      toast.error("Error adding chat");
      console.error("Error adding chat:", error);
    }

  }

  // Update the setChat method to handle status monitoring

  async setChat(item) {
    // First set the basic chat info
    chatStore.setChatUser(item);
    chatStore.setMessageId(item.messageId);
    const { user, unreadMessages } = chatStore;

    // For direct chats, ensure we have latest user status
    if (!item.isGroup && item.rId) {
      try {
        // Get the latest user status
        const userStatusRef = doc(db, "userStatus", item.rId);
        const statusDoc = await getDoc(userStatusRef);

        if (statusDoc.exists()) {
          const isOnline = statusDoc.data().online || false;
          const lastSeen = statusDoc.data().lastSeen;

          // Update the chat user with latest status
          const updatedItem = {
            ...item,
            user: {
              ...item.user,
              isOnline,
              lastSeen: lastSeen ? lastSeen.toDate() : null
            }
          };

          // Update the store with the fresh data
          chatStore.setChatUser(updatedItem);
        }
      } catch (error) {
        console.log("Error getting latest user status:", error);
      }
    }

    // Mark as read if needed
    if (unreadMessages[item.messageId]) {
      try {
        const userChatRef = doc(db, "userChats", user.id);
        const userSnap = await getDoc(userChatRef);

        if (userSnap.exists()) {
          const userChatData = userSnap.data();
          const chatDataClone = [...userChatData.chatData];

          const chatIndex = chatDataClone.findIndex(c => c.messageId === item.messageId);
          if (chatIndex !== -1) {
            chatDataClone[chatIndex].messageSeen = true;

            await updateDoc(userChatRef, {
              chatData: chatDataClone
            });
          }
        }
      } catch (error) {
        console.log("Error marking messages as read:", error);
      }
    }
  }
  componentDidMount() {
    const tid = toast.loading("Loading chats...");
    const user = chatStore.user;

    if (user?.id) {
      this.setState({ user }, () => {
        this.setupChatListener(user);
        toast.dismiss(tid);
      });
    } else {
      toast.dismiss(tid);
      // Let componentDidUpdate handle when user becomes available
    }
  }



  componentDidUpdate(prevProps, prevState) {
    const prevUserId = prevState.user?.id;
    const currentUserId = chatStore.user?.id;

    // If user has just been loaded into the store
    if (currentUserId && prevUserId !== currentUserId) {
      this.setState({ user: chatStore.user }, () => {
        this.cleanupChatListener();
        this.setupChatListener(this.state.user);
      });
    }
  }


  componentWillUnmount() {
    // Clean up chat listeners
    this.cleanupChatListener();

    // Clean up any other resources or subscriptions
    if (this.unsubscribeFromStore) {
      this.unsubscribeFromStore();
    }
  }

  setupChatListener = (user) => {
    if (!user?.id) return;

    // First clean up any existing listener to prevent duplicates
    this.cleanupChatListener();

    const userChatRef = doc(db, "userChats", user.id);
    this.unsubscribeChatListener = onSnapshot(userChatRef, async (snap) => {
      if (snap.exists()) {
        const chatData = snap.data().chatData || [];

        // Process the chat data to ensure we have all user information
        const processedChatData = await Promise.all(
          chatData.map(async (chat) => {
            if (chat.isGroup) return chat;

            // Fetch user data if not already present
            if (chat.rId) {
              try {
                // Get user data
                const userDoc = await getDoc(doc(db, "users", chat.rId));

                // IMPORTANT: Also fetch user status data
                const userStatusDoc = await getDoc(doc(db, "userStatus", chat.rId));

                if (userDoc.exists()) {
                  const userData = userDoc.data();

                  // Add status information
                  let isOnline = false;
                  let lastSeen = null;

                  if (userStatusDoc.exists()) {
                    const statusData = userStatusDoc.data();
                    isOnline = statusData.online || false;
                    lastSeen = statusData.lastSeen ? statusData.lastSeen.toDate() : null;
                  }

                  // Return complete user data with status
                  return {
                    ...chat,
                    user: {
                      ...userData,
                      id: chat.rId,
                      isOnline,
                      lastSeen
                    }
                  };
                }
              } catch (error) {
                console.log("Error fetching user data:", error);
              }
            }
            return chat;
          })
        );

        // Sort all chats by updatedAt timestamp before splitting
        const sortedData = processedChatData.sort((a, b) => {
          const aTime = a.updatedAt instanceof Date ? a.updatedAt.getTime() : new Date(a.updatedAt).getTime();
          const bTime = b.updatedAt instanceof Date ? b.updatedAt.getTime() : new Date(b.updatedAt).getTime();
          return bTime - aTime; // Descending order - newest first
        });

        // Split the sorted data into direct and group chats
        const groupChats = sortedData.filter(chat => chat.isGroup);
        const directChats = sortedData.filter(chat => !chat.isGroup);

        // Update MobX store with the direct chats
        chatStore.setChatData(directChats);

        // Update local state for group chats
        this.setState({ chatDataGroup: groupChats });
      } else {
        chatStore.setChatData([]);
        this.setState({ chatDataGroup: [] });
      }
    });
  };

  cleanupChatListener = () => {
    if (this.unsubscribeChatListener) {
      this.unsubscribeChatListener();
      this.unsubscribeChatListener = null;
    }
  };

  isGroupAdmin = (group) => {
    return group?.admins?.includes(this.state.user.id);
  }

  async fetchGroupMembers(memberIds) {
    if (!memberIds?.length) return;

    this.setState({ isLoadingMembers: true });
    try {
      const membersData = await Promise.all(
        memberIds.map(async (id) => {
          const userDoc = await getDoc(doc(db, "users", id));
          if (userDoc.exists()) {
            return {
              id,
              ...userDoc.data()
            };
          }
          return { id, username: "Unknown User" };
        })
      );
      this.setState({ groupMembers: membersData });
    } catch (error) {
      // console.error("Error fetching group members:", error);
      toast.error("Failed to load group members");
    } finally {
      this.setState({ isLoadingMembers: false });
    }
  }

  // Update formatLastSeen method to handle all edge cases

  formatLastSeen(date) {
    if (!date) return "Offline";

    try {
      const now = new Date();
      const diffInSeconds = Math.floor((now - date) / 1000);

      // If less than 1 minute, show "Just now"
      if (diffInSeconds < 60) {
        return "Just now";
      }

      // Use date-fns for consistent formatting
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      console.log("Error formatting last seen:", error);
      return "Offline";
    }
  }

  async handleOpenGroupSettings(group) {
    this.setState({
      activeGroup: group,
      groupSettingsVisible: true,
    })

    // Fetch complete group data
    try {
      const groupDoc = await getDoc(doc(db, "messages", group.messageId));
      if (groupDoc.exists()) {
        const fullGroupData = {
          ...group,
          ...groupDoc.data()
        };
        this.setState({ activeGroup: fullGroupData });

        // Initialize the edit form
        if (this.groupEditFormRef.current) {
          this.groupEditFormRef.current.setFieldsValue({
            groupName: fullGroupData.groupName,
            groupDescription: fullGroupData.groupDescription || ''
          });
        }


        // Fetch members data
        if (fullGroupData.members) {
          this.fetchGroupMembers(fullGroupData.members);
        }
      }
    } catch (error) {
      console.error("Error fetching group details:", error);
      toast.error("Failed to load group details");
    }
  };

  async handleUpdateGroup(values) {

    if (!this.state.activeGroup?.messageId) return;

    const { groupName, groupDescription } = values;
    const { activeGroup, user, groupImage, selectedMembers } = this.state;
    const loadingToast = toast.loading("Updating group...");

    try {
      // Upload new image if provided
      let groupImageUrl = activeGroup.groupImage;
      if (this.state.groupImage && this.state.groupImage !== activeGroup.groupImage) {
        const formData = new FormData();
        formData.append('file', groupImage);
        formData.append('upload_preset', import.meta.env.VITE_cloudinary_cloud_prefix);

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_cloudinary_cloud_name}/upload`,
          {
            method: 'POST',
            body: formData
          }
        );

        const imageData = await response.json();
        if (imageData.secure_url) {
          groupImageUrl = imageData.secure_url;
        }
      }

      // Add new members if any are selected
      let updatedMembers = [...activeGroup.members];
      if (selectedMembers.length > 0) {
        // Filter out any already existing members
        const newMembers = selectedMembers.filter(id => !updatedMembers.includes(id));
        updatedMembers = [...updatedMembers, ...newMembers];

        // Add system message for new members
        if (newMembers.length > 0) {
          await addDoc(collection(db, "messages", activeGroup.messageId, "chatMessages"), {
            system: true,
            text: `${user.username} added ${newMembers.length} new members to the group`,
            createdAt: serverTimestamp()
          });

          // Add group to new members' chat lists
          for (const memberId of newMembers) {
            await updateUserChatList(memberId, {
              messageId: activeGroup.messageId,
              isGroup: true,
              groupName: groupName,
              groupImage: groupImageUrl,
              members: updatedMembers,
              lastMessage: `${user.username} added you to the group`,
              updatedAt: Date.now(),
              messageSeen: false
            });
          }
        }
      }

      // Update the group document
      await updateDoc(doc(db, "messages", activeGroup.messageId), {
        groupName,
        groupDescription,
        groupImage: groupImageUrl,
        members: updatedMembers,
        updatedAt: serverTimestamp()
      });

      // Update all members' chat lists with new group info
      for (const memberId of updatedMembers) {
        const userChatRef = doc(db, "userChats", memberId);
        const userSnap = await getDoc(userChatRef);

        if (userSnap.exists()) {
          const userChatData = userSnap.data();
          const chatDataClone = [...userChatData.chatData];

          const chatIndex = chatDataClone.findIndex(c => c.messageId === activeGroup.messageId);
          if (chatIndex !== -1) {
            chatDataClone[chatIndex] = {
              ...chatDataClone[chatIndex],
              groupName,
              groupImage: groupImageUrl,
              members: updatedMembers,
              lastMessage: `${user.username} updated the group information`,
              updatedAt: Date.now(),
              messageSeen: memberId === user.id
            };

            await updateDoc(userChatRef, {
              chatData: chatDataClone
            });
          }
        }
      }

      toast.dismiss(loadingToast);
      toast.success("Group updated successfully");

      // Update local states
      this.setState({
        activeGroup: {
          ...this.state.activeGroup,
          groupName,
          groupDescription,
          groupImage: groupImageUrl,
          members: updatedMembers
        }
      })


      // Reset UI states
      this.setState({
        selectedMembers: [],
        groupEditMode: false,
      })

      // Refetch members data if new members were added
      if (selectedMembers.length > 0) {
        this.fetchGroupMembers(updatedMembers);
      }

    } catch (error) {
      // console.error("Error updating group:", error);
      toast.dismiss(loadingToast);
      toast.error("Failed to update group");
    }


  }

  async removeMemberFromGroup(memberId) {

    if (!this.state.activeGroup?.messageId) return;
    const { activeGroup, user } = this.state;

    const loadingToast = toast.loading("Removing member...");

    try {
      // Get the member being removed
      const memberToRemove = this.state.groupMembers.find(m => m.id === memberId);
      const memberName = memberToRemove?.username || "Unknown User";

      // Update the members list in the group document
      const updatedMembers = activeGroup.members.filter(id => id !== memberId);
      // Also remove from admins list if they were an admin
      const updatedAdmins = activeGroup.admins.filter(id => id !== memberId);

      await updateDoc(doc(db, "messages", activeGroup.messageId), {
        members: updatedMembers,
        admins: updatedAdmins
      });

      // Add system message about member removal
      await addDoc(collection(db, "messages", activeGroup.messageId, "chatMessages"), {
        system: true,
        text: `${user.username} removed ${memberName} from the group`,
        createdAt: serverTimestamp()
      });

      // Remove the group from the removed member's chat list
      const memberChatRef = doc(db, "userChats", memberId);
      const memberSnap = await getDoc(memberChatRef);

      if (memberSnap.exists()) {
        const memberChatData = memberSnap.data();
        const updatedChatData = memberChatData.chatData.filter(
          chat => chat.messageId !== activeGroup.messageId
        );

        await updateDoc(memberChatRef, {
          chatData: updatedChatData
        });
      }

      // Update all remaining members' chat lists
      for (const id of updatedMembers) {
        const userChatRef = doc(db, "userChats", id);
        const userSnap = await getDoc(userChatRef);

        if (userSnap.exists()) {
          const userChatData = userSnap.data();
          const chatDataClone = [...userChatData.chatData];

          const chatIndex = chatDataClone.findIndex(c => c.messageId === activeGroup.messageId);
          if (chatIndex !== -1) {
            chatDataClone[chatIndex] = {
              ...chatDataClone[chatIndex],
              members: updatedMembers,
              lastMessage: `${user.username} removed ${memberName} from the group`,
              updatedAt: Date.now(),
              messageSeen: id === user.id
            };

            await updateDoc(userChatRef, {
              chatData: chatDataClone
            });
          }
        }
      }

      toast.dismiss(loadingToast);
      toast.success(`${memberName} removed from the group`);

      this.setState({
        activeGroup: {
          ...this.state.activeGroup,
          members: updatedMembers,
          admins: updatedAdmins
        }
      })
      // Update members list

      this.setState({
        groupMembers: this.state.groupMembers.filter(m => m.id !== memberId),
      })

    } catch (error) {
      console.error("Error removing member:", error);
      toast.dismiss(loadingToast);
      toast.error("Failed to remove member");
    }

  }

  async addMembersToGroup() {

    const { activeGroup, user, selectedMembers } = this.state;
    if (!activeGroup?.messageId || !selectedMembers.length) return;

    const loadingToast = toast.loading("Adding members...");

    try {
      // Get existing members and add new ones
      const updatedMembers = [...activeGroup.members, ...selectedMembers];

      // Update the group document with new members
      await updateDoc(doc(db, "messages", activeGroup.messageId), {
        members: updatedMembers
      });

      // Add system messages for each new member
      for (const memberId of selectedMembers) {
        const memberDoc = await getDoc(doc(db, "users", memberId));
        const memberName = memberDoc.exists() ? memberDoc.data().username : "Unknown User";

        await addDoc(collection(db, "messages", activeGroup.messageId, "chatMessages"), {
          system: true,
          text: `${user.username} added ${memberName} to the group`,
          createdAt: serverTimestamp()
        });

        // Add group to new member's chat list
        await this.updateUserChatList(memberId, {
          messageId: activeGroup.messageId,
          isGroup: true,
          groupName: activeGroup.groupName,
          groupImage: activeGroup.groupImage,
          members: updatedMembers,
          lastMessage: `${user.username} added you to the group`,
          updatedAt: Date.now(),
          messageSeen: false
        });
      }

      // Update existing members' chat lists
      for (const id of activeGroup.members) {
        const userChatRef = doc(db, "userChats", id);
        const userSnap = await getDoc(userChatRef);

        if (userSnap.exists()) {
          const userChatData = userSnap.data();
          const chatDataClone = [...userChatData.chatData];

          const chatIndex = chatDataClone.findIndex(c => c.messageId === activeGroup.messageId);
          if (chatIndex !== -1) {
            chatDataClone[chatIndex] = {
              ...chatDataClone[chatIndex],
              members: updatedMembers,
              lastMessage: `${user.username} added ${selectedMembers.length} members to the group`,
              updatedAt: Date.now(),
              messageSeen: id === user.id
            };

            await updateDoc(userChatRef, {
              chatData: chatDataClone
            });
          }
        }
      }

      toast.dismiss(loadingToast);
      toast.success(`${selectedMembers.length} members added to the group`);


      this.setState({
        activeGroup: {
          ...this.state.activeGroup,
          members: updatedMembers
        }
      })

      // Fetch updated members list
      this.fetchGroupMembers(updatedMembers);

      // Reset UI state
      this.setState({ selectedMembers: [] })

    } catch (error) {
      console.error("Error adding members:", error);
      toast.dismiss(loadingToast);
      toast.error("Failed to add members to the group");
    }

  }

  async toggleAdminStatus(memberId) {
    const { activeGroup, groupMembers } = this.state;
    if (!activeGroup?.messageId || !this.isGroupAdmin(activeGroup)) return;

    try {
      const isAdmin = activeGroup.admins.includes(memberId);
      let updatedAdmins;

      if (isAdmin) {
        // Cannot remove the last admin
        if (activeGroup.admins.length <= 1) {
          toast.error("Cannot remove the last admin");
          return;
        }
        updatedAdmins = activeGroup.admins.filter(id => id !== memberId);
      } else {
        updatedAdmins = [...activeGroup.admins, memberId];
      }

      // Update the admins list in the group document
      await updateDoc(doc(db, "messages", activeGroup.messageId), {
        admins: updatedAdmins
      });

      // Get the member being updated
      const memberToUpdate = groupMembers.find(m => m.id === memberId);
      const memberName = memberToUpdate?.username || "Unknown User";

      // Add system message about admin status change
      await addDoc(collection(db, "messages", activeGroup.messageId, "chatMessages"), {
        system: true,
        text: isAdmin
          ? `${memberName} is no longer an admin`
          : `${memberName} is now an admin`,
        createdAt: serverTimestamp()
      });

      toast.success(isAdmin
        ? `Removed admin status from ${memberName}`
        : `${memberName} is now an admin`
      );

      // Update the local state
      this.setState(prevState => ({
        activeGroup: {
          ...prevState.activeGroup,
          admins: updatedAdmins
        },
        groupMembers: prevState.groupMembers.map(m =>
          m.id === memberId ? { ...m, isAdmin: !isAdmin } : m
        )
      }));

    } catch (error) {
      // console.error("Error toggling admin status:", error);
      toast.error("Failed to update admin status");
    }

  }

  render() {
    const {
      groupModalOpen,
      imageUrl,
      search,
      selectedMembers,
      addMemberMode,
      userSearchResults,
      searchingUsers,
      searchUser,
      searchQuery,
      searchLoading,
      noUserFound,
      chatDataGroup,
      groupSettingsVisible,
      activeGroup,
      groupMembers,
      isLoadingMembers,
      groupEditMode
    } = this.state;
    const { user, chatData, unreadMessages } = chatStore;
    const { formRef, groupEditFormRef, isGroupAdmin } = this;

    return (
      <div className='ls'>
        {/* Header */}
        <div className='ls-top'>
          <Button
            type='primary'
            style={{ margin: "10px 10px" }}
            onClick={() => this.setState({ groupModalOpen: true })}
          >
            Create a Group
          </Button>

          {/* Group Creation Modal */}
          <Modal
            title="Create Group"
            open={groupModalOpen}
            onCancel={this.handleModalClose}
            footer={null}
            width={500}
          >
            <Form
              ref={formRef}
              layout="vertical"
              onFinish={this.createGroup}
            >
              {/* Group Image Upload */}
              <Form.Item label="Group Photo" name="groupImage">
                <Upload
                  name="avatar"
                  listType="picture-circle"
                  className="avatar-uploader"
                  showUploadList={false}
                  beforeUpload={(file) => {
                    // Return false to prevent automatic upload
                    return false;
                  }}
                  onChange={(e) => this.handleImageChange(e)}
                >
                  {imageUrl ? (
                    <Avatar
                      src={imageUrl}
                      size={100}
                      style={{ width: '100%', height: '100%' }}
                    />
                  ) : (
                    <div>
                      <PlusOutlined />
                      <div style={{ marginTop: 8 }}>Upload</div>
                    </div>
                  )}
                </Upload>
              </Form.Item>

              {/* Group Name */}
              <Form.Item
                label="Group Name"
                name="groupName"
                rules={[{ required: true, message: 'Please enter a group name' }]}
              >
                <Input placeholder="Enter group name" />
              </Form.Item>

              {/* Group Description */}
              <Form.Item
                label="Group Description (Optional)"
                name="groupDescription"
              >
                <Input.TextArea
                  placeholder="Enter group description"
                  rows={2}
                />
              </Form.Item>

              {/* Group Members */}
              <Form.Item
                label="Add Members"
                name="members"
                rules={[{ required: true, message: 'Please add at least one member' }]}
              >
                <Select
                  mode="multiple"
                  placeholder="Search for users to add"
                  value={selectedMembers}
                  onChange={(value) => this.setState({ selectedMembers: value })}
                  onSearch={(value) => this.searchUsers(value)}
                  loading={searchingUsers}
                  filterOption={false}
                  notFoundContent={searchingUsers ? <Spin size="small" /> : "No users found"}
                  style={{ width: '100%' }}
                  options={userSearchResults}
                >
                </Select>
              </Form.Item>

              {/* Submit and Cancel Buttons */}
              <Form.Item>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <Button onClick={this.handleModalClose}>
                    Cancel
                  </Button>
                  <Button
                    type="primary"
                    htmlType="submit"
                    disabled={!formRef?.current?.getFieldValue('groupName') || selectedMembers.length === 0}
                  >
                    Create Group
                  </Button>
                </div>
              </Form.Item>
            </Form>
          </Modal>

          <div className="ls-nav">
            <img src={assets.logo} alt="" className='logo' />
            <div className="menu">
              <IoMdMenu size={30} className='menu-icon' />
              <div className='sub-menu'>
                <Link to="/profile"><p>Edit Profile</p></Link>
                <hr />
                <p onClick={() => LogOutUser()}>Log Out</p>
              </div>
            </div>
          </div>
          <div className="ls-search">
            <input
              type="text"
              placeholder='Search by username'
              onChange={(e) => this.handleSearch(e)}
              value={searchQuery}
            />
            <img
              src={searchLoading ? assets.loading_icon : assets.search_icon}
              alt={searchLoading ? "Loading" : "Search"}
              className={searchLoading ? "loading-icon" : ""}
            />
          </div>
        </div>

        {/* Chat list */}
        <div className="ls-list">
          {/* Search results */}
          {search && (
            <>
              {searchLoading ? (
                <div className="search-status"><p>Searching...</p></div>
              ) : noUserFound ? (
                <div className="search-status no-results">
                  <p>No user found with username "{searchQuery}"</p>
                </div>
              ) : searchUser ? (
                <div className="frinds search-result" onClick={() => this.addChat(searchUser)}>
                  <img src={searchUser.profilePic || assets.profile_img} alt="" className="object-cover aspect-square w-12 rounded-full" />
                  <div className='text-sm'>
                    <p>{searchUser.username}</p>
                    <span className='text-xs'>{searchUser.bio || "No bio available"}</span>
                  </div>
                </div>
              ) : null}
            </>
          )}

          {/* Existing chats */}
          {!search && (
            <>
              {/* Check if either direct chats or group chats exist */}
              {chatData.length > 0 || chatDataGroup.length > 0 ? (
                <>
                  {/* Group chats section */}
                  {chatDataGroup.length > 0 && (
                    <div className="chat-section">
                      <div className="section-header">
                        <h3>Group Chats</h3>
                      </div>

                      {chatDataGroup.map((item, index) => (
                        <div className="frinds group-chat-item" key={`group-${index}`}>
                          <div className="chat-content" onClick={() => this.setChat(item)}>
                            <div className="friend-avatar">
                              <img
                                src={item.groupImage || assets.logo_icon}
                                alt=""
                                className="object-cover"
                              />
                            </div>
                            <div className="friend-info">
                              <div className="friend-header">
                                <p>{item.groupName}</p>
                                <span className="last-time">
                                  {new Date(item.updatedAt).toLocaleDateString(undefined, {
                                    day: 'numeric',
                                    month: 'short'
                                  })}
                                </span>
                              </div>
                              <div className="friend-message">
                                <span className="message-preview">{item.lastMessage || "No messages yet"}</span>
                                {unreadMessages[item.messageId] && <span className="unread-badge">New</span>}
                              </div>
                              <span className="status-text">
                                {item.members?.length || 0} members
                              </span>
                            </div>
                          </div>
                          <div
                            className="group-settings-icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              this.handleOpenGroupSettings(item);
                            }}
                          >
                            <SettingOutlined />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Direct chats section - Use chatData from MobX store */}
                  {chatData && chatData.length > 0 && (
                    <div className="chat-section">
                      <div className="section-header">
                        <h3>Direct Messages</h3>
                      </div>

                      {/* Map through chatData from MobX store */}
                      {chatData.map((item, index) => (
                        <div className="frinds" key={`direct-${index}`} onClick={() => this.setChat(item)}>
                          <div className="friend-avatar">
                            <img
                              src={item.user?.profilePic || assets.profile_img}
                              alt=""
                              className="object-cover"
                            />
                            <div className={`status-indicator ${item.user?.isOnline ? "online" : "offline"}`}></div>
                          </div>
                          <div className="friend-info">
                            <div className="friend-header">
                              <p>{item.user?.username || "Unknown User"}</p>
                              <span className="last-time">
                                {new Date(item.updatedAt).toLocaleDateString(undefined, {
                                  day: 'numeric',
                                  month: 'short'
                                })}
                              </span>
                            </div>
                            <div className="friend-message">
                              <span className="message-preview">{item.lastMessage || "No messages yet"}</span>
                              {unreadMessages[item.messageId] && <span className="unread-badge">New</span>}
                            </div>
                            <span className="status-text">
                              {item.user?.isOnline === true
                                ? "Online"
                                : item.user?.lastSeen ? this.formatLastSeen(item.user.lastSeen) : "Offline"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="no-chat text-center">
                  <h2>No Chats Available</h2>
                  <p>Search for users to start chatting</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Group Settings Modal */}
        <Modal
          title={
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <SettingOutlined style={{ marginRight: 8 }} />
              {activeGroup?.groupName || 'Group Settings'}
            </div>
          }
          open={groupSettingsVisible}
          onCancel={() => {
            this.setState({
              groupSettingsVisible: false,
              groupEditMode: false,
              addMemberMode: false,
              activeGroup: null,
              groupMembers: [],
              imageUrl: null,
              groupImage: null,
            })
            if (groupEditFormRef.current) {
              groupEditFormRef.current.resetFields();
            }
          }}
          footer={null}
          width={600}
        >
          {activeGroup ? (
            <Tabs defaultActiveKey="info">
              <Tabs.TabPane
                tab={
                  <span>
                    <TeamOutlined /> Group Info
                  </span>
                }
                key="info"
              >
                {groupEditMode ? (
                  <Form
                    ref={groupEditFormRef}
                    layout="vertical"
                    onFinish={this.handleUpdateGroup}
                  >
                    <Form.Item label="Group Photo" name="groupImage">
                      <Upload
                        name="avatar"
                        listType="picture-circle"
                        className="avatar-uploader"
                        showUploadList={false}
                        beforeUpload={(file) => false}
                        onChange={(e) => this.handleImageChange(e)}
                      >
                        {imageUrl || activeGroup.groupImage ? (
                          <Avatar
                            src={imageUrl || activeGroup.groupImage}
                            size={100}
                            style={{ width: '100%', height: '100%' }}
                          />
                        ) : (
                          <div>
                            <PlusOutlined />
                            <div style={{ marginTop: 8 }}>Upload</div>
                          </div>
                        )}
                      </Upload>
                    </Form.Item>

                    <Form.Item
                      label="Group Name"
                      name="groupName"
                      rules={[{ required: true, message: 'Group name is required' }]}
                    >
                      <Input placeholder="Enter group name" />
                    </Form.Item>

                    <Form.Item
                      label="Group Description"
                      name="groupDescription"
                    >
                      <Input.TextArea
                        placeholder="Enter group description"
                        rows={3}
                      />
                    </Form.Item>

                    <Form.Item label="Add Members">
                      <Select
                        mode="multiple"
                        placeholder="Search for users to add"
                        style={{ width: '100%', marginBottom: 16 }}
                        value={selectedMembers}
                        onChange={(value) => this.setState({ selectedMembers: value })}
                        onSearch={this.searchUsers}
                        loading={searchingUsers}
                        filterOption={false}
                        notFoundContent={searchingUsers ? <Spin size="small" /> : "No users found"}
                        options={userSearchResults.filter(
                          user => !activeGroup.members.includes(user.value)
                        )}
                      />
                    </Form.Item>


                    <Form.Item>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <Button onClick={() => this.setState({ groupEditMode: false })}>
                          Cancel
                        </Button>
                        <Button type="primary" htmlType="submit">
                          Save Changes
                        </Button>
                      </div>
                    </Form.Item>
                  </Form>
                ) : (
                  <div className="group-info-container">
                    <div className="group-info-header">
                      <Avatar
                        size={80}
                        src={activeGroup.groupImage || assets.logo_icon}
                        alt={activeGroup.groupName}
                      />
                      <div className="group-info-text">
                        <h2>{activeGroup.groupName}</h2>
                        <p className="group-description">
                          {activeGroup.groupDescription || "No description"}
                        </p>
                        <div className="group-meta">
                          <p>Created {activeGroup.createdAt?.toDate
                            ? formatDistanceToNow(activeGroup.createdAt.toDate(), { addSuffix: true })
                            : "recently"}
                          </p>
                          <p>{activeGroup.members?.length || 0} members</p>
                        </div>
                      </div>
                    </div>

                    {isGroupAdmin(activeGroup) && (
                      <div style={{ marginTop: 16 }}>
                        <Button
                          type="primary"
                          icon={<EditOutlined />}
                          onClick={() => this.setState({ groupEditMode: true })}
                        >
                          Edit Group
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Tabs.TabPane>

              <Tabs.TabPane
                tab={
                  <span>
                    <UserOutlined /> Members ({activeGroup.members?.length || 0})
                  </span>
                }
                key="members"
              >
                {/* Admin-only controls to add members */}
                {isGroupAdmin(activeGroup) && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ marginBottom: 8 }}>
                      <Button
                        type="primary"
                        icon={<UserAddOutlined />}
                        onClick={() => this.setState({ addMemberMode: true })}
                        style={{ marginBottom: addMemberMode ? 16 : 0 }}
                      >
                        Add Members
                      </Button>
                    </div>

                    {addMemberMode && (
                      <div style={{ backgroundColor: '#f5f5f5', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                        <h4 style={{ marginTop: 0, marginBottom: 8 }}>Add New Members</h4>
                        <Select
                          mode="multiple"
                          placeholder="Search for users to add"
                          style={{ width: '100%', marginBottom: 16 }}
                          value={selectedMembers}
                          onChange={(value) => this.setState({ selectedMembers: value })}
                          onSearch={this.searchUsers}
                          loading={searchingUsers}
                          filterOption={false}
                          notFoundContent={searchingUsers ? <Spin size="small" /> : "No users found"}
                          options={userSearchResults.filter(
                            user => !activeGroup.members.includes(user.value)
                          )}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                          <Button onClick={() => {
                            this.setState({ addMemberMode: false, selectedMembers: [] });
                          }}>
                            Cancel
                          </Button>
                          <Button
                            type="primary"
                            disabled={selectedMembers.length === 0}
                            onClick={this.addMembersToGroup}
                          >
                            Add {selectedMembers.length} Members
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Members list */}
                {isLoadingMembers ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                    <Spin />
                  </div>
                ) : (
                  <List
                    itemLayout="horizontal"
                    dataSource={groupMembers}
                    renderItem={member => (
                      <List.Item
                        actions={this.isGroupAdmin(activeGroup) ? [
                          // Only show admin toggle for non-creator members or other admins
                          (activeGroup.createdBy !== member.id) && (
                            <Button
                              size="small"
                              type={activeGroup.admins?.includes(member.id) ? "default" : "primary"}
                              onClick={() => this.toggleAdminStatus(member.id)}
                              disabled={activeGroup.admins?.length === 1 && activeGroup.admins?.includes(member.id)}
                            >
                              {activeGroup.admins?.includes(member.id) ? "Remove Admin" : "Make Admin"}
                            </Button>
                          ),
                          // Only show remove button for non-self members
                          member.id !== user.id && (
                            <Popconfirm
                              title="Remove from group?"
                              description={`Are you sure you want to remove ${member.username || "this user"}?`}
                              onConfirm={() => this.removeMemberFromGroup(member.id)}
                              okText="Yes"
                              cancelText="No"
                            >
                              <Button
                                size="small"
                                type="text"
                                danger
                              >
                                Remove
                              </Button>
                            </Popconfirm>
                          )
                        ] : member.id === user.id ? [
                          // Allow non-admin users to leave the group
                          <Popconfirm
                            title="Leave group?"
                            description="Are you sure you want to leave this group?"
                            onConfirm={() => this.removeMemberFromGroup(member.id)}
                            okText="Yes"
                            cancelText="No"
                          >
                            <Button
                              size="small"
                              type="text"
                              danger
                            >
                              Leave Group
                            </Button>
                          </Popconfirm>
                        ] : []}
                      >
                        <List.Item.Meta
                          avatar={<Avatar src={member.profilePic || assets.profile_img} />}
                          title={
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {member.username || "Unknown User"}
                              {member.id === user.id && <Tag color="blue">You</Tag>}
                              {activeGroup.admins?.includes(member.id) && (
                                <Tag color="gold">Admin</Tag>
                              )}
                            </div>
                          }
                          description={member.id === activeGroup.createdBy ? "Group Creator" : "Member"}
                        />
                      </List.Item>
                    )}
                  />
                )}
              </Tabs.TabPane>
            </Tabs>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Spin size="large" />
              <p style={{ marginTop: 16 }}>Loading group information...</p>
            </div>
          )}
        </Modal>
      </div>
    )
  }
}

export default observer(LeftSidebar);