import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

interface MarkdownLink {
  readonly line: number;
  readonly target: string;
}

const localDestination = (target: string): string =>
  decodeURIComponent(target.split('#')[0]!);

const resolveLink = (root: string, source: string, target: string): string => {
  const destination = localDestination(target);
  return destination.startsWith('/')
    ? resolve(root, '.' + destination)
    : resolve(dirname(source), destination);
};

/// File destinations in inline links/images and reference definitions. Code examples
/// are not navigation. Heading fragments and remote URLs are outside this check.
export const localMarkdownLinks = (text: string): MarkdownLink[] => {
  const links: MarkdownLink[] = [];
  const add = (target: string): void => {
    if (target.startsWith('#') || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(target)) {
      return;
    }
    // Bun's GFM parser resolves reference links and ignores code in any container.
    // Destinations have no source offsets; report their first textual occurrence.
    const offset = text.indexOf(target);
    links.push({
      line: text.slice(0, Math.max(0, offset)).split('\n').length,
      target
    });
  };
  Bun.markdown.render(text, {
    image: (_children, { src }) => {
      add(src);
      return '';
    },
    link: (_children, { href }) => {
      add(href);
      return '';
    }
  });
  return links;
};

/// Private evidence is checked by check-restricted-citations.ts. Portable checks
/// cover tracked file destinations and explicit ADR successor acknowledgements.
export const checkDocumentLinks = (
  root: string,
  paths: readonly string[]
): string[] => {
  const errors: string[] = [];
  for (const path of paths) {
    const source = resolve(root, path);
    if (!existsSync(source)) {
      continue;
    }
    const text = readFileSync(source, 'utf8');
    const links = localMarkdownLinks(text);
    const predecessor = path.match(/^docs\/adr\/(\d{4})-/)?.[1];
    const lines = text.split('\n');
    if (predecessor) {
      for (const [index, line] of lines.slice(0, 12).entries()) {
        if (!/superseded\b/i.test(line)) {
          continue;
        }
        const successors = localMarkdownLinks(line);
        for (const match of line.matchAll(/ADR[\s-]*(\d{4})\b/g)) {
          const link = successors.find(candidate =>
            basename(localDestination(candidate.target)).startsWith(
              match[1]! + '-'
            )
          );
          if (!link) {
            errors.push(
              `${path}:${index + 1}: supersession must link ADR ${match[1]}`
            );
          } else {
            const successor = resolveLink(root, source, link.target);
            if (
              existsSync(successor) &&
              !new RegExp(String.raw`ADR[\s-]*${predecessor}\b`).test(
                readFileSync(successor, 'utf8')
              )
            ) {
              errors.push(
                `${path}:${index + 1}: ADR ${match[1]} does not acknowledge ADR ${predecessor}`
              );
            }
          }
        }
      }
    }
    for (const link of links) {
      const destination = localDestination(link.target);
      if (!destination) {
        continue;
      }
      const target = resolveLink(root, source, link.target);
      const targetPath = relative(root, target);
      if (/^(?:restricted|roms)(?:\/|$)/.test(targetPath)) {
        continue;
      }
      const at = `${path}:${link.line}`;
      if (!existsSync(target)) {
        errors.push(`${at}: ${link.target} does not exist`);
        continue;
      }
    }
  }
  return errors;
};

if (import.meta.main) {
  const root = resolve(import.meta.dir, '../..');
  const paths = execFileSync(
    'git',
    [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
      '-z',
      '--',
      '*.md'
    ],
    {
      cwd: root,
      encoding: 'utf8'
    }
  )
    .split('\0')
    .filter(Boolean);
  const errors = checkDocumentLinks(root, paths);
  if (errors.length) {
    process.stderr.write(errors.join('\n') + '\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Docs: ${paths.length} Markdown files have valid local file links and declared ADR successors.\n`
    );
  }
}
