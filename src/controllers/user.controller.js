import { asyncHandler } from '../utils/asyncHandler.js'
import { ApiError } from '../utils/ApiError.js'
import { User } from '../models/user.model.js'
import { uploadOnCloudinary } from '../utils/cloudinary.js'
import { ApiResponse } from '../utils/ApiResponse.js'

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

export { registerUser }