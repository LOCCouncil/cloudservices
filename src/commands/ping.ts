import Command from '../class/Command'
import Client from '../Client'
import { Message } from 'eris'

export default class Ping extends Command {
    constructor(client: Client) {
        super(client)
        this.name = 'ping'
        this.description = 'Pings the bot'
    }

    public async run (message: Message) {
        const clientStart: number = Date.now()
        const msg: Message = await message.channel.createMessage('🏓 Pong!')
        msg.edit(`🏓 Pong!\nClient: \`${Date.now() - clientStart}ms\`\nResponse: \`${msg.createdAt - message.createdAt}ms\``)
    }
}