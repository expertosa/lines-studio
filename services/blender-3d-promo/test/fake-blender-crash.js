#!/usr/bin/env node
// Finishes every frame, then dies by signal the way the bpy module can during teardown.
import { fakeRender } from './fake-blender.js';

if (fakeRender() === 0) process.kill(process.pid, 'SIGSEGV');
process.exit(1);
