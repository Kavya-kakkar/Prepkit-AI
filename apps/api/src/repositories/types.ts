import { Kit, PipelineStage } from '@ai-prep/core';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
}

export interface Session {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: string;
}

export interface Job {
  id: string;
  userId: string;
  dedupeKey: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  stage: PipelineStage;
  percent: number;
  message: string;
  kitId?: string;
  kit?: Kit;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KitRecord {
  id: string;
  userId: string;
  dedupeKey: string;
  version: number;
  kit: Kit;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeRecord {
  userId: string;
  questionId: string;
  kitId: string;
  ratings: number[];
  needScore: number;
  updatedAt: string;
}
