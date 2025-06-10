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
  }

  componentDidUpdate(prevProps, prevState) {
    const { chatUser } = chatStore
    if (chatUser && window.innerWidth < 768) {
      this.setState({ activeMObileTab: 'messages' })
    }
  }

  render() {

    const { activeMObileTab } = this.state
    const { chatUser } = chatStore
    return (

      <div className='chat'>
        <div className='mobile-header'>
          <div className='mobile-nav'>
            <div
              className={`nav-item ${this.state.activeMObileTab === 'chats' ? 'active' : ''}`}
              onClick={() => this.setState({ activeMObileTab: 'chats' })}
            >
              <FaUsers />
              <span>Chats</span>
            </div>

            <div
              className={`nav-item ${this.state.activeMObileTab  === 'messages' ? 'active' : ''}`}
              onClick={() => this.setState({ activeMObileTab: 'messages' })}
            >
              <IoChatbox />
              <span>Messages</span>
            </div>

            <div
              className={`nav-item ${this.state.activeMObileTab  === 'profile' ? 'active' : ''}`}
              onClick={() => this.setState({ activeMObileTab: 'profile' })}
            >
              <CgProfile />
              <span>Profile</span>
            </div>
          </div>
        </div>

        <div className='chat-container'>

          <div className={`sidebar-container ${(this.state.activeMObileTab  === 'chats' || window.innerWidth > 768) ? '' : 'mobile-hidden'}`}>
            <LeftSidebar />
          </div>

          <div className={`chatbox-container ${(this.state.activeMObileTab  === 'messages' || window.innerWidth > 768) ? '' : 'mobile-hidden'}`}>
            <ChatBox />
          </div>

          <div className={`profile-container ${(this.state.activeMObileTab  === 'profile' || window.innerWidth > 768) ? '' : 'mobile-hidden'}`}>
            <RigthSideBar />
          </div>
        </div>
      </div>
    )
  }
}

export default observer(Chat)
