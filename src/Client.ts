import Eris from 'eris';
import mongoose from 'mongoose';
import signale from 'signale';
import fs from 'fs-extra';
import path from 'path';
import config from './config.json';
import { Account, AccountInterface, Moderation, ModerationInterface, Domain, DomainInterface } from './models';
import { emojis } from './stores';
import { Command, Util, Collection } from './class';


export default class Client extends Eris.Client {
  public config: { 'token': string; 'cloudflare': string; 'prefix': string; 'emailPass': string; };

  public util: Util;

  public commands: Collection<Command>;

  public aliases: Map<string, string>;

  public db: { Account: mongoose.Model<AccountInterface>; Domain: mongoose.Model<DomainInterface>; Moderation: mongoose.Model<ModerationInterface>; };

  public stores: { emojis: { success: string, loading: string, error: string }; };

  public signale: signale.Signale;

  constructor() {
    super(config.token, { getAllUsers: true, restMode: true, defaultImageFormat: 'png' });

    process.title = 'cloudservices';
    this.config = config;
    this.util = new Util(this);
    this.commands = new Collection({ base: Command });
    this.db = { Account, Domain, Moderation };
    this.stores = { emojis };
    this.signale = signale;
    this.signale.config({
      displayDate: true,
      displayTimestamp: true,
      displayFilename: true,
    });
    this.events();
    this.loadFunctions();
    this.init();
  }

  private async events() {
    process.on('unhandledRejection', (error) => {
      this.signale.error(error);
    });
  }

  private async loadFunctions() {
    const functions = await fs.readdir('./functions');
    functions.forEach(async (func) => {
      if (func === 'index.ts' || func === 'index.js') return;
      try {
        (require(`./functions/${func}`).default)(this);
      } catch (error) {
        this.signale.error(`Error occured loading ${func}`);
        await this.util.handleError(error);
      }
    });
  }

  public loadCommand(commandPath: string) {
    // eslint-disable-next-line no-useless-catch
    try {
      // eslint-disable-next-line
      const command: Command = new (require(commandPath).default)(this);
      if (command.subcmds.length) {
        command.subcmds.forEach((C) => {
          const cmd: Command = new C(this);
          command.subcommands.add(cmd.name, cmd);
        });
        delete command.subcmds;
      }
      this.commands.add(command.name, command);
      this.signale.complete(`Loaded command ${command.name}`);
    } catch (err) { throw err; }
  }

  public async init() {
    const evtFiles = await fs.readdir('./events/');
    const commands = await fs.readdir(path.join(__dirname, './commands/'));
    commands.forEach((command) => {
      if (command === 'index.js') return;
      this.loadCommand(`./commands/${command}`);
    });

    evtFiles.forEach((file) => {
      const eventName = file.split('.')[0];
      if (file === 'index.js') return;
      // eslint-disable-next-line
      const event = new (require(`./events/${file}`).default)(this);
      this.signale.complete(`Loaded event ${eventName}`);
      this.on(eventName, (...args) => event.run(...args));
      delete require.cache[require.resolve(`./events/${file}`)];
    });

    await mongoose.connect(config.mongoURL, { useNewUrlParser: true, useUnifiedTopology: true });
    await this.connect();
    this.on('ready', () => {
      this.signale.info(`Connected to Discord as ${this.user.username}#${this.user.discriminator}`);
    });
  }
}

// eslint-disable-next-line
new Client();
