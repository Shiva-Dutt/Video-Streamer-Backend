import mongoose, {Schema} from "mongoose";

const subscriptionSchema = new Schema(
    {
        subscriber: {
            type: Schema.Types.ObjectId, // one who is subscribing to the channel(user)
            ref: "User"
        },
        channel: {
            type: Schema.Types.ObjectId, // whose channel one is subscribing to
            ref: "User"
        },
    },
    {
       timestamps: true,
    }
)

export const Subscription = mongoose.model("Subscription",subscriptionSchema)