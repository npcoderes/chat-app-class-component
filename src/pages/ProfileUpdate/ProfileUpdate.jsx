import React, { Component } from 'react'
import { observer } from 'mobx-react'
import chatStore from '../../mobexStore/chatStore'
import { doc, updateDoc } from 'firebase/firestore';
import './profileupdate.css'
import { Link } from 'react-router-dom'
import { IoMdArrowBack, IoMdCamera } from 'react-icons/io'
import toast from 'react-hot-toast'
import { db } from '../../config/firebase'


const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_cloudinary_cloud_prefix;
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_cloudinary_cloud_name;

class ProfileUpdate extends Component {
  constructor(props) {
    super(props)
    this.state = {
      name: '',
      bio: '',
      isUploading: false,
      previewUrl: null,

    }
    this.fileInputRef = React.createRef()
  }

  handleFileChange = (e) => {
    const file = e.target.files[0]
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('File size exceeds 2MB limit')
      return
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      this.setState({
        previewUrl: reader.result,
      })
    };
    reader.readAsDataURL(file);

    // Upload to Cloudinary
    this.uploadToCloudinary(file);
  }

  async uploadToCloudinary(file) {
    const { user } = chatStore;
    this.setState({ isUploading: true })

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await response.json();

      if (data.secure_url) {
        // Update preview with the actual Cloudinary URL
        this.setState({
          previewUrl: data.secure_url,
        });
        toast.success('Image uploaded successfully');
      } else {
        toast.error('Failed to upload image');
        console.error('Upload failed:', data);
      }
    } catch (error) {
      toast.error('Error uploading image');
      console.error('Error uploading to Cloudinary:', error);
    } finally {
      this.setState({ isUploading: false });
    }


  }
  triggerFileInput = () => {
    if (this.fileInputRef.current) {
      this.fileInputRef.current.click();
    }
  }

  async handleSubmit(e) {
    const { user } = chatStore;
    e.preventDefault();
    const { name, bio, previewUrl } = this.state;
    if (!name && !bio && !previewUrl) {
      toast.error("Please make some changes to update");
      return;
    }

    // Create an object with only the fields that changed
    const updateData = {};
    if (name) updateData.username = name;
    if (bio) updateData.bio = bio;
    if (previewUrl) updateData.profilePic = previewUrl;


    try {
      const userRef = doc(db, "users", user.id);
      await updateDoc(userRef, updateData);
      toast.success("Profile updated successfully");

      // Update local context (optional - depends on your app structure)
      chatStore.setUser({ ...user, ...updateData });
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    }
  }

  render() {
    const { user } = chatStore
    const { isUploading, previewUrl } = this.state;

    if (!user) {
      return (
        <div role="status" className="flex items-center justify-center h-screen">
          <svg aria-hidden="true" className="w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor" />
            <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill" />
          </svg>
          <span className="sr-only">Loading...</span>
        </div>
      )
    }
    return (

      <div className='profile'>
        <div className='profileContainer'>
          <form action="" onSubmit={(e) => this.handleSubmit(e)}>
            <h3>Profile Details</h3>

            <div className="profile-image-container">
              <img
                src={previewUrl || (user ? user.profilePic : null)}
                alt=""
                className='profile-pic'
              />
              <div className="upload-overlay" onClick={this.triggerFileInput}>
                {isUploading ? (
                  <div className="upload-spinner"></div>
                ) : (
                  <IoMdCamera className="camera-icon" />
                )}
              </div>
              <input
                type="file"
                ref={this.fileInputRef}
                onChange={this.handleFileChange}
                accept="image/*"
                style={{ display: 'none' }}
              />
            </div>

            <input
              type="text"
              placeholder='Your Name'
              defaultValue={user ? user.username : ""}
              onChange={(e) => this.setState({ name: e.target.value })}
            />

            <textarea
              name=""
              id=""
              placeholder='Write about You bio'
              defaultValue={user.bio || ""}
              onChange={(e) => this.setState({ bio: e.target.value })}
            />

            <button
              type='submit'
              disabled={isUploading}
              className={isUploading ? 'disabled' : ''}
            >
              {isUploading ? 'Uploading...' : 'Save'}
            </button>
          </form>

          <div className='profile-back'>
            <img src={user ? user.profilePic : null} alt="" className='profile-pic' />
            <Link to="/chat" className='profile-link'>
              <p><IoMdArrowBack /> Back to Chat</p>
            </Link>
          </div>
        </div>
      </div>
    )
  }
}


export default observer(ProfileUpdate)
