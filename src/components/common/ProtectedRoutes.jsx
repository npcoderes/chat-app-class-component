import React from 'react'
import { observer } from 'mobx-react-lite'
import chatStore from '../../mobexStore/chatStore'
import { Link } from 'react-router-dom'

const ProtectedRoutes = ({ children }) => {
  const { user } = chatStore
  return (
    <>
      {
        // user ? children : <div className='flex justify-center items-center h-screen text-2xl font-bold'>Please Login to access this page
        //   <Link to='/' className='text-blue-500 ml-2'>Login</Link>
        // </div>
        children
      }
    </>
  )
}

export default observer(ProtectedRoutes)