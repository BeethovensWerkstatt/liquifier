import { simpleGit, CleanOptions } from 'simple-git';

const git = simpleGit();
await git.clean(CleanOptions.FORCE);
export const gitFileDate = async (file) => new Date((await git.log({
  format: '%cI', file
})).all[0]?.date || 0);
