import type { Server } from 'socket.io';
import type { IncomingMessage, ServerResponse } from 'node:http';
export function createNightfall(io: Server, options?: {
  accountStore?: {register(nickname:string,password:string):Promise<{id:string;nickname:string}>;login(nickname:string,password:string):Promise<{id:string;nickname:string}|null>;createSession(id:string):Promise<string>;authenticate(token:string):Promise<{id:string;nickname:string}|null>;logout(token:string):Promise<void>};
  allowLocalDebug?: boolean; debugAccountIds?: string[]; ready?: Promise<void>; allowGuest?: boolean; dataFile?: string;
}): { rooms: Map<string, unknown>; syncRoom(room: unknown, full?: boolean): void; close(): Promise<void> };
export function handleNightfallRequest(req: IncomingMessage, res: ServerResponse, base?: string): Promise<boolean>;
