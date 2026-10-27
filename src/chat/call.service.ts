import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type CallStatus = 'ringing' | 'active';

export interface ActiveCall {
  id: string;
  caller: string;
  callee: string;
  status: CallStatus;
}

/**
 * In-memory registry of live calls. Knowing the (caller, callee) pair for a
 * callId server-side — rather than trusting a client-supplied "to" on every
 * signaling message — is what stops one user from relaying WebRTC signals
 * into somebody else's call.
 */
@Injectable()
export class CallService {
  private readonly calls = new Map<string, ActiveCall>();

  create(caller: string, callee: string): ActiveCall {
    const call: ActiveCall = {
      id: randomUUID(),
      caller: caller.toLowerCase(),
      callee: callee.toLowerCase(),
      status: 'ringing',
    };
    this.calls.set(call.id, call);
    return call;
  }

  get(callId: string): ActiveCall | undefined {
    return this.calls.get(callId);
  }

  markActive(callId: string): void {
    const call = this.calls.get(callId);
    if (call) call.status = 'active';
  }

  end(callId: string): void {
    this.calls.delete(callId);
  }

  /** Is this user already a party to any in-flight call? */
  isBusy(username: string): boolean {
    return this.callsInvolving(username).length > 0;
  }

  callsInvolving(username: string): ActiveCall[] {
    const name = username.toLowerCase();
    return [...this.calls.values()].filter((call) => call.caller === name || call.callee === name);
  }

  otherParty(call: ActiveCall, username: string): string {
    return call.caller === username.toLowerCase() ? call.callee : call.caller;
  }

  /** Only the two parties on the call may act on it. */
  isParty(call: ActiveCall, username: string): boolean {
    const name = username.toLowerCase();
    return call.caller === name || call.callee === name;
  }
}
