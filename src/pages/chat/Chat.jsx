import React, { Component } from 'react'
import './chat.css'
import LeftSidebar from '../../components/leftSideBar/LeftSidebar'
import ChatBox from '../../components/chatBox/ChatBox'
import RigthSideBar from '../../components/rightSideBar/RigthSideBar'
import assets from '../../assets/assets'
import { IoChatbox } from 'react-icons/io5'
import { FaUsers } from 'react-icons/fa'
import { CgProfile } from 'react-icons/cg'
import chatStore from '../../mobexStore/chatStore'
import { observer } from 'mobx-react'

class Chat extends Component {
  constructor(props) {
    super(props)
    this.state = {
      activeMObileTab: 'chats',
    }
    // Track previous chatUser to prevent infinite updates
    this.prevChatUser = null
  }

  componentDidUpdate(prevProps, prevState) {
    const { chatUser } = chatStore

    // Only update if chatUser actually changed and prevent infinite loop
    if (chatUser !== this.prevChatUser &&
      chatUser &&
      window.innerWidth < 768 &&
      this.state.activeMObileTab !== 'messages') {
      this.setState({ activeMObileTab: 'messages' })
    }

    // Update the previous chatUser reference
    this.prevChatUser = chatUser
  }

  // Add method to handle tab changes
  handleTabChange = (tab) => {
    this.setState({ activeMObileTab: tab })
  }

  render() {
    const { activeMObileTab } = this.state
    const { chatUser } = chatStore

    return (
      <div className='chat'>
        <div className='mobile-header'>
          <div className='mobile-nav'>
            <div
              className={`nav-item ${activeMObileTab === 'chats' ? 'active' : ''}`}
              onClick={() => this.handleTabChange('chats')}
            >
              <FaUsers />
              <span>Chats</span>
            </div>

            <div
              className={`nav-item ${activeMObileTab === 'messages' ? 'active' : ''}`}
              onClick={() => this.handleTabChange('messages')}
            >
              <IoChatbox />
              <span>Messages</span>
            </div>

            <div
              className={`nav-item ${activeMObileTab === 'profile' ? 'active' : ''}`}
              onClick={() => this.handleTabChange('profile')}
            >
              <CgProfile />
              <span>Profile</span>
            </div>
          </div>
        </div>

        <div className='chat-container'>
          <div className={`sidebar-container ${(activeMObileTab === 'chats' || window.innerWidth > 768) ? '' : 'mobile-hidden'}`}>
            <LeftSidebar />
          </div>

          <div className={`chatbox-container ${(activeMObileTab === 'messages' || window.innerWidth > 768) ? '' : 'mobile-hidden'}`}>
            <ChatBox />
          </div>

          <div className={`profile-container ${(activeMObileTab === 'profile' || window.innerWidth > 768) ? '' : 'mobile-hidden'}`}>
            <RigthSideBar />
          </div>
        </div>
      </div>
    )
  }
}

export default observer(Chat)
