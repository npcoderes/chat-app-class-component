import React, { Component } from 'react'
import './login.css'
import assets from "../../assets/assets"
import { FaEye, FaEyeSlash } from 'react-icons/fa'
import toast from 'react-hot-toast'
import { signUpUser, LogInUser } from '../../config/firebase'
import { withNavigation } from '../../components/common/withNavigation'
import chatStore from '../../mobexStore/chatStore'


export class Login extends Component {
  constructor(props) {
    super(props)
    this.state = {
      email: '',
      password: '',
      username: '',
      file: null,
      togglePassword: false,
      signUp: false,
      profilePic: assets.avatar_icon,
      loading: false
    }
  }

  handleChange(e) {
    const file = e.target.files[0];

    if (!file) {
      toast.error("No file selected");
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error("Please select a valid image file");
      return;
    }

    // Validate file size (limit: 2MB)
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB in bytes
    if (file.size > MAX_SIZE) {
      toast.error("Image size should be less than 2MB");
      return;
    }

    // Show success and set state
    toast.success("Image selected successfully");

    this.setState({
      file: file,
      profilePic: URL.createObjectURL(file)
    });
  }

  async handleImgCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'chat-app'); // Replace with your Cloudinary upload preset
    formData.append('cloud_name', 'da72q7tvb'); // Replace with your Cloudinary cloud name

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${formData.get('cloud_name')}/image/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      return data.secure_url
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  }

  async handleSubmit(e) {
    e.preventDefault();
    const { email, password, username, file, signUp } = this.state;
    if (!email || !password || (!signUp && !username)) {
      toast.error("Please fill all the fields");
      return;
    }

    if (!signUp) {
      this.setState({ loading: true });
      let tid = toast.loading("Creating your account...");
      const profilePicUrl = await this.handleImgCloudinary(file);
      if (!profilePicUrl) {
        toast.error("Please select a valid image");
        return;
      }

      const res = await signUpUser(username, email, password, profilePicUrl);
      if (res) {
        toast.dismiss(tid);
        this.setState({ loading: false, signUp: true });
        toast.success("Account created successfully");
      } else {
        toast.dismiss(tid);
        this.setState({ loading: false });
      }


    } else {
      this.setState({ loading: true })
      let tid = toast.loading("Logging in...");
      const res = await LogInUser(email, password);
      console.log(res);
      if (!res) {
        toast.dismiss(tid);
        this.setState({ loading: false });
        return;
      }
      toast.dismiss(tid);
      await chatStore.loadUserData(res.user.uid);
      this.props.navigate("/profile");
      toast.success("Logged in successfully");
    }
  }


  render() {
    const { email, password, username, togglePassword, signUp, profilePic, loading } = this.state;

    return (
      <div className='login'>
        <img src={assets.logo_big} alt="" className='logo' />
        <form className="login-form" onSubmit={(e) => this.handleSubmit(e)}>
          <h2>{
            signUp ? "Login" : "Sign Up"
          }</h2>

          {
            !signUp && <input type="text" placeholder='username' className='form-input ' onChange={(e) => this.setState({ username: e.target.value })} autoComplete='UserName' />
          }
          <input type="email" placeholder='Email Address' className='form-input ' onChange={(e) => this.setState({ email: e.target.value })} />
          <div className='password-input'>
            <input type={togglePassword ? "text" : "password"} placeholder='password' className='form-input ' onChange={(e) => this.setState({ password: e.target.value })} autoComplete='current-password' />
            {
              togglePassword ? (
                <FaEyeSlash className='eye-icon' onClick={() => this.setState({
                  togglePassword: !togglePassword
                })} />
              ) : (
                <FaEye className='eye-icon' onClick={() => this.setState({
                  togglePassword: !togglePassword
                })} />
              )
            }
          </div>
          {
            !signUp && (<div className="profilePic">
              <label htmlFor="profilePic">
                <img src={profilePic} alt="Profile" />
                <div className="upload-icon">
                  <span>+</span>
                </div>
                <input type="file" id='profilePic' accept='image/*' onChange={(e) => this.handleChange(e)} />
              </label>
            </div>)
          }
          <button type="submit" >{
            signUp ? "Login" : "Create a Account"
          }</button>
          <div className="login-forgot">
            <p>
              {
                !signUp ? "Already have an account?" : "Don't have an account?"
              }  <span onClick={() => this.setState({
                signUp: !signUp
              })}>Click Here</span>
            </p>
          </div>
        </form>
      </div>
    )
  }
}

export default withNavigation(Login)