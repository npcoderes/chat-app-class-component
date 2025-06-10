
import { Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'
import Login from './pages/Login/Login'
import Chat from './pages/chat/Chat'
import ProfileUpdate from './pages/ProfileUpdate/ProfileUpdate'
import { useContext, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './config/firebase'
import { AppContext } from './context/AppContext'
import { observer } from 'mobx-react-lite'
import chatStore from './mobexStore/chatStore'
import ProtectedRoutes from './components/common/ProtectedRoutes'

const App = observer(() => {
  const navigate = useNavigate()

  useEffect(() => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        chatStore.loadUserData(user.uid)
      } else {
        navigate('/')
      }
    })
  }, [])

  useEffect(() => {

    chatStore.setupChatListeners()
    return () => {
      chatStore.cleanup()
      chatStore.chatSnap?.();
    }
  }, [chatStore.user])

  return (
    <>
      <Routes>
        <Route path='/' element={<Login />} />
        <Route path='/chat' element={<ProtectedRoutes>
          <Chat />
        </ProtectedRoutes>} />
        <Route path='/profile' element={<ProtectedRoutes>
          <ProfileUpdate />
        </ProtectedRoutes>} />
      </Routes>
    </>
  )
})

export default App
