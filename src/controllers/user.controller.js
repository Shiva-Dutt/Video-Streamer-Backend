import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { User } from '../models/user.model.js'
import { uploadOnCloudinary } from '../utils/cloudinary.js'
import { ApiResponse } from '../utils/ApiResponse.js'
import jwt from 'jsonwebtoken';

const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        return { accessToken , refreshToken }

    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token.")
    }
}

const registerUser = asyncHandler( async(req,res) => {
    // get user details from request
    // validation - check if all the required fields are specified
    // check if user already exists: username and email
    // check for images and avatar
    // if yes upload to cloudinary -- get url from cloudinary service
    // create user object --create entry in db
    // add only specific response (remove pswd and refresh token)
    // check for user creation
    // return res

    const { username, email, fullname, password } = req.body
    
    if([fullname, email, username, password].some((field) => field?.trim() === "")){
        throw new ApiError(400, "Fill in the required fields")
    }

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })
    if(existedUser){
        //console.log("Existed user: ",existedUser) //debug
        throw new ApiError(409, "User with email or username already exists")
    }

    //console.log("Files from multer: ",req.files)// debug
    const avatarLocalPath = req.files?.avatar[0]?.path
    //const coverImageLocalPath = req.files?.coverImage[0]?.path
    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path
    }
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required")
    }

    const avatarCloud = await uploadOnCloudinary(avatarLocalPath)
    const coverImageCloud = await uploadOnCloudinary(coverImageLocalPath)
    if(!avatarCloud){
        throw new ApiError(400, "Avatar file is required")
    }
    //console.log("Files from cloudinary: ",avatarCloud)// debug

    const user = await User.create(
        {
            fullname,
            avatar: avatarCloud.url,
            coverImage: coverImageCloud?.url || "",
            email,
            password,
            username: username.toLowerCase()
        }
    )

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering the user")
    }
    //console.log("Created User:", createdUser)//debug
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    )

} )

const loginUser = asyncHandler ( async(req,res) => {
    // req body -> data
    // username or email validation
    // find the user
    // password check --if no wrong pswd
    // if yes -- access and refresh token
    // send secure cookies 
    // response

    const { username, password, email } = req.body

    if(!(username || email)){
        throw new ApiError(400,"Username or password is required")
    }

    const existsUser = await User.findOne({  // Capital User for mongodb ops
        $or: [{ username } , { email }]
    })

    if(!existsUser){
        throw new ApiError(409, "User does not exist")
    }

    const isPasswordValid = await existsUser.isPasswordCorrect(password) // created user instance from mongo finds for user created methods
    if(!isPasswordValid){
        throw new ApiError(401, "Invalid User credentials")
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(existsUser._id) //exists user refresh token is empty because its called higher up the hierarchy

    const loggedInUser = await User.findById(existsUser._id).select(
        "-password -refreshToken"
    )

    const options = {
        httpOnly: true, //secure and http only makes sure that this cannot be edited from client side(frontend)
        secure: true
    }

    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, 
                accessToken, 
                refreshToken
            },
            "User logged in successfully"
        )
    )
})

const logoutUser = asyncHandler ( async(req,res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    ) 

    const options = {
        httpOnly: true, //secure and http only makes sure that this cannot be edited from client side(frontend)
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"))
})

const refreshAccessToken = asyncHandler ( async (req,res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized request")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)    
    
        const user = await User.findById(decodedToken?._id)
        if(!user){
            throw new ApiError(401, "Invalid refresh token")
        }
    
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh token is expired or used")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const newGeneratedTokens = await generateAccessAndRefreshTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", newGeneratedTokens.accessToken, options)
        .cookie("refreshToken", newGeneratedTokens.refreshToken, options)
        .json(new ApiResponse(200, {accessToken: newGeneratedTokens.accessToken, refreshToken: newGeneratedTokens.refreshToken}, "Access token refreshed"))
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler ( async(req,res) => {
    const { oldPassword, newPassword } = req.body

    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

    if(!isPasswordCorrect){
        throw new ApiError(400, "Invalid old password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave: false})

    return res
    .status(200)
    .json(
        new ApiResponse(200, {}, "Password changed successfully")
    )
})

const getCurrentUser = asyncHandler ( async(req,res) => {
    return res.status(200).json(new ApiResponse(200, req.user, "Current user fetched successfully"))
})

const updateAccountDetails = asyncHandler ( async (req, res) => {
    const {fullname, email } = req.body

    if(!fullname || !email){
        throw new ApiError(400, "All fields are required")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullname,
                email
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"))

})

const updateUserAvatar = asyncHandler ( async(req,res) => {
    const avatarLocalPath = req.file?.path

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file not found")
    }

    const avatarPath = await uploadOnCloudinary(avatarLocalPath)
    if(!avatarPath.url){
        throw new ApiError(400, "Error while uploading on avatar")
    }

    const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set:{
                avatar: avatarPath.url
            }
        },
        {
            new: true
        }).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfully"))
})

const updateUserCoverImage = asyncHandler ( async(req,res) => {
    const coverImageLocalPath = req.file?.path

    if(!coverImageLocalPath){
        throw new ApiError(400, "Cover Image file not found")
    }

    const coverImagePath = await uploadOnCloudinary(coverImageLocalPath)
    if(!coverImagePath.url){
        throw new ApiError(400, "Error while uploading on Cover Image")
    }

    const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set:{
                coverImage: coverImagePath.url
            }
        },
        {
            new: true
        }).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar updated successfully"))
})


export {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage 
}