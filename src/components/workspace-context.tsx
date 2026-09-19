'use client';
import {createContext,useContext} from 'react';
import type {Workspace} from '@/lib/domain';
export const WorkspaceContext=createContext<Workspace|null>(null);
export function useWorkspace(){const value=useContext(WorkspaceContext);if(!value)throw new Error('Workspace provider is missing.');return value;}
