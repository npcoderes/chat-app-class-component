import React, { Component } from 'react'
import './RigthSideBar.css'
import { AppContext } from '../../context/AppContext'
import { Link } from 'react-router-dom'
import { LogOutUser } from '../../config/firebase'
import { FaSignOutAlt, FaUserEdit, FaUserCircle, FaMoon, FaSun, FaInfoCircle } from 'react-icons/fa'
import { observer } from 'mobx-react'
import chatStore from '../../mobexStore/chatStore'

export class RigthSideBar extends Component {
  render() {
    const { user } = chatStore
    return (
      <>
        <div className='rs'>
          {/* User Profile */}
          <div className="rs-profile">
            <div className="profile-header">
              <img src={user?.profilePic} alt="" className="profile-avatar" />
              <div className="online-badge"></div>
            </div>

            <h2 className="profile-name">{user?.username}</h2>
            <p className="profile-status">Active</p>

            <div className="profile-info">
              <p className="profile-email">{user?.email}</p>
              <p className="profile-bio">{user?.bio || "No bio available"}</p>
            </div>
          </div>

          {/* User Actions */}
          <div className="rs-actions">
            <Link to="/profile" className="action-button">
              <FaUserEdit />
              <span>Edit Profile</span>
            </Link>


            <button className="action-button logout" onClick={() => LogOutUser()}>
              <FaSignOutAlt />
              <span>Logout</span>
            </button>
          </div>

          {/* App Version */}
          <div className="rs-footer">
            <p>Chat App v1.0.0</p>
          </div>
        </div>
      </>
    )
  }
}

export default observer(RigthSideBar)