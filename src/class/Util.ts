/* eslint-disable no-param-reassign */
import { promisify } from 'util';
import childProcess from 'child_process';
import nodemailer from 'nodemailer';
import { Message, PrivateChannel, GroupChannel, Member, User } from 'eris';
import uuid from 'uuid/v4';
import moment from 'moment';
import fs from 'fs';
import os from 'os';
import { Client } from '..';
import { Command, RichEmbed } from '.';
import { ModerationInterface, AccountInterface } from '../models';

export default class Util {
  public client: Client;

  public transport: nodemailer.Transporter;

  constructor(client: Client) {
    this.client = client;
    this.transport = nodemailer.createTransport({
      host: 'staff.libraryofcode.org',
      auth: { user: 'support', pass: this.client.config.emailPass },
    });
  }

  /**
   * Executes a terminal command async.
   * @param command The command to execute
   * @param options childProcess.ExecOptions
   */
  public async exec(command: string, options: childProcess.ExecOptions = {}): Promise<string> {
    const ex = promisify(childProcess.exec);
    let result: string;
    try {
      const res = await ex(command, options);
      result = `${res.stdout}${res.stderr}`;
    } catch (err) {
      return Promise.reject(new Error(`Command failed: ${err.cmd}\n${err.stderr}${err.stdout}`));
    }
    return result;
  }

  /**
   * Resolves a command
   * @param query Command input
   * @param message Only used to check for errors
   */
  public resolveCommand(query: string | string[], message?: Message): Promise<{cmd: Command, args: string[] }> {
    try {
      let resolvedCommand: Command;
      if (typeof query === 'string') query = query.split(' ');
      const commands = this.client.commands.toArray();
      resolvedCommand = commands.find((c) => c.name === query[0].toLowerCase() || c.aliases.includes(query[0].toLowerCase()));

      if (!resolvedCommand) return Promise.resolve(null);
      query.shift();
      while (resolvedCommand.subcommands.size && query.length) {
        const subCommands = resolvedCommand.subcommands.toArray();
        const found = subCommands.find((c) => c.name === query[0].toLowerCase() || c.aliases.includes(query[0].toLowerCase()));
        if (!found) break;
        resolvedCommand = found;
        query.shift();
      }
      return Promise.resolve({ cmd: resolvedCommand, args: query });
    } catch (error) {
      if (message) this.handleError(error, message);
      else this.handleError(error);
      return Promise.reject(error);
    }
  }

  public async handleError(error: Error, message?: Message, command?: Command): Promise<void> {
    try {
      this.client.signale.error(error);
      const info = { content: `\`\`\`js\n${error.stack}\n\`\`\``, embed: null };
      if (message) {
        const embed = new RichEmbed();
        embed.setColor('FF0000');
        embed.setAuthor(`Error caused by ${message.author.username}#${message.author.discriminator}`, message.author.avatarURL);
        embed.setTitle('Message content');
        embed.setDescription(message.content);
        embed.addField('User', `${message.author.mention} (\`${message.author.id}\`)`, true);
        embed.addField('Channel', message.channel.mention, true);
        let guild: string;
        if (message.channel instanceof PrivateChannel || message.channel instanceof GroupChannel) guild = '@me';
        else guild = message.channel.guild.id;
        embed.addField('Message link', `[Click here](https://discordapp.com/channels/${guild}/${message.channel.id}/${message.id})`, true);
        embed.setTimestamp(new Date(message.timestamp));
        info.embed = embed;
      }
      await this.client.createMessage('595788220764127272', info);
      const msg = message.content.slice(this.client.config.prefix.length).trim().split(/ +/g);
      if (command) this.resolveCommand(msg).then((c) => { c.cmd.enabled = false; });
      if (message) message.channel.createMessage(`***${this.client.stores.emojis.error} An unexpected error has occured - please contact a member of the Engineering Team.${command ? ' This command has been disabled.' : ''}***`);
    } catch (err) {
      this.client.signale.error(err);
    }
  }

  public splitFields(fields: { name: string, value: string, inline?: boolean }[]): { name: string, value: string, inline?: boolean }[][] {
    let index = 0;
    const array: {name: string, value: string, inline?: boolean}[][] = [[]];
    while (fields.length) {
      if (array[index].length >= 25) { index += 1; array[index] = []; }
      array[index].push(fields[0]); fields.shift();
    }
    return array;
  }

  public splitString(string: string, length: number): string[] {
    if (!string) return [];
    if (Array.isArray(string)) string = string.join('\n');
    if (string.length <= length) return [string];
    const arrayString: string[] = [];
    let str: string = '';
    let pos: number;
    while (string.length > 0) {
      pos = string.length > length ? string.lastIndexOf('\n', length) : string.length;
      if (pos > length) pos = length;
      str = string.substr(0, pos);
      string = string.substr(pos);
      arrayString.push(str);
    }
    return arrayString;
  }


  public async createHash(password: string): Promise<string> {
    const hashed = await this.exec(`mkpasswd -m sha-512 "${password}"`);
    return hashed;
  }

  public isValidEmail(email: string): boolean {
    const checkAt = email.indexOf('@');
    if (checkAt < 1) return false;
    const checkDomain = email.indexOf('.', checkAt + 2);
    if (checkDomain < checkAt) return false;
    return true;
  }

  public randomPassword(): string {
    let tempPass = ''; const passChars = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    while (tempPass.length < 5) { tempPass += passChars[Math.floor(Math.random() * passChars.length)]; }
    return tempPass;
  }

  public async createAccount(hash: string, etcPasswd: string, username: string, userID: string, emailAddress: string, moderatorID: string): Promise<AccountInterface> {
    await this.exec(`useradd -m -p ${hash} -c ${etcPasswd} -s /bin/zsh ${username}`);
    await this.exec(`chage -d0 ${username}`);

    const account = new this.client.db.Account({
      username, userID, emailAddress, createdBy: moderatorID, createdAt: new Date(), locked: false, ssInit: false, homepath: `/home/${username}`,
    });
    return account.save();
  }

  public async deleteAccount(username: string): Promise<void> {
    const account = await this.client.db.Account.findOne({ username });
    if (!account) throw new Error('Account not found');
    this.exec(`lock ${username}`);
    const tasks = [
      this.exec(`deluser ${username} --remove-home --backup-to /management/Archives && rm -rf -R ${account.homepath}`),
      this.client.db.Account.deleteOne({ username }),
    ];
    this.client.removeGuildMemberRole('446067825673633794', account.userID, '546457886440685578', 'Cloud Account Deleted').catch();
    // @ts-ignore
    await Promise.all(tasks);
  }

  public async messageCollector(message: Message, question: string, timeout: number, shouldDelete = false, choices: string[] = null, filter = (msg: Message): boolean|void => {}): Promise<Message> {
    const msg = await message.channel.createMessage(question);
    return new Promise((res, rej) => {
      setTimeout(() => { if (shouldDelete) msg.delete().catch(); rej(new Error('Did not supply a valid input in time')); }, timeout);
      this.client.on('messageCreate', (Msg) => {
        if (filter(Msg) === false) return;
        const verif = choices ? choices.includes(Msg.content) : Msg.content;
        if (verif) { if (shouldDelete) msg.delete().catch(); res(Msg); }
      });
    });
  }

  /**
   * @param type `0` - Create
   *
   * `1` - Warn
   *
   * `2` - Lock
   *
   * `3` - Unlock
   *
   * `4` - Delete
   */
  public async createModerationLog(user: string, moderator: Member|User, type: number, reason?: string, duration?: number): Promise<ModerationInterface> {
    const moderatorID = moderator.id;
    const account = await this.client.db.Account.findOne({ $or: [{ username: user }, { userID: user }] });
    if (!account) return Promise.reject(new Error(`Account ${user} not found`));
    const { username, userID } = account;
    const logInput: { username: string, userID: string, logID: string, moderatorID: string, reason?: string, type: number, date: Date, expiration?: { date: Date, processed: boolean }} = {
      username, userID, logID: uuid(), moderatorID, type, date: new Date(),
    };

    const now: number = Date.now();
    let date: Date;
    let processed = true;
    if (reason) logInput.reason = reason;
    if (type === 2) {
      if (duration) {
        date = new Date(now + duration);
        processed = false;
      } else date = null;
    }

    const expiration = { date, processed };

    logInput.expiration = expiration;
    const log = new this.client.db.Moderation(logInput);
    await log.save();

    let embedTitle: string;
    let color: string;
    let archType: string;
    switch (type) {
      default: archType = 'Staff'; embedTitle = 'Cloud Account | Generic'; color = '0892e1'; break;
      case 0: archType = 'Administrator'; embedTitle = 'Cloud Account | Create'; color = '00ff00'; break;
      case 1: archType = 'Staff'; embedTitle = 'Account Warning | Warn'; color = 'ffff00'; break;
      case 2: archType = 'Moderator'; embedTitle = 'Account Infraction | Lock'; color = 'ff6600'; break;
      case 3: archType = 'Moderator'; embedTitle = 'Account Reclaim | Unlock'; color = '0099ff'; break;
      case 4: archType = 'Administrator'; embedTitle = 'Cloud Account | Delete'; color = 'ff0000'; break;
    }
    const embed = new RichEmbed()
      .setTitle(embedTitle)
      .setColor(color)
      .addField('User', `${username} | <@${userID}>`, true)
      .addField(archType, moderatorID === this.client.user.id ? 'SYSTEM' : `<@${moderatorID}>`, true)
      .setFooter(this.client.user.username, this.client.user.avatarURL)
      .setTimestamp();
    if (reason) embed.addField('Reason', reason || 'Not specified');
    if (type === 2) embed.addField('Lock Expiration', `${date ? moment(date).format('dddd, MMMM Do YYYY, h:mm:ss A') : 'Indefinitely'}`);
    // @ts-ignore
    this.client.createMessage('580950455581147146', { embed }); this.client.getDMChannel(userID).then((channel) => channel.createMessage({ embed })).catch();

    return Promise.resolve(log);
  }

  public getAcctHash(userpath: string) {
    try {
      return fs.readFileSync(`${userpath}/.securesign/auth`).toString();
    } catch (error) {
      return null;
    }
  }
}
