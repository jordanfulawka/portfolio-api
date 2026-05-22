const express = require('express');
const { Octokit } = require('octokit');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});
const router = express.Router();

let activityCache = { data: null, lastFetched: 0 };
const CACHE_TTL = 1000 * 60; // refetch every 1 minute

router.route('/activity').get(async (req, res) => {
  const now = Date.now();

  if (
    activityCache.data &&
    now - activityCache.lastFetched < CACHE_TTL &&
    process.env.NODE_ENV === 'production'
  ) {
    return res.json(activityCache.data);
  } else {
    console.log('endpoint running');
  }
  const repos = await octokit.request('GET /users/{username}/repos', {
    username: 'jordanfulawka',
    headers: {
      'X-Github-Api-Version': '2026-03-10',
    },
  });
  const data = repos.data;
  const repoNames = data.map((repo) => repo.name);
  let totalCommits = 0;
  const since = new Date(
    new Date().setFullYear(new Date().getFullYear() - 1),
  ).toISOString();
  const recentCommits = await Promise.allSettled(
    repoNames.map(async (repo) => {
      const response = await octokit.request(
        'GET /repos/{owner}/{repo}/commits?author=jordanfulawka&since={since}',
        {
          owner: 'jordanfulawka',
          repo: repo,
          since: since,
        },
      );
      totalCommits += response.data.length;

      const languages = await octokit.request(
        'GET /repos/{owner}/{repo}/languages',
        {
          owner: 'jordanfulawka',
          repo: repo,
        },
      );

      return {
        repo: repo,
        message: response.data[0].commit.message,
        date: response.data[0].commit.committer.date,
        languages: languages.data,
      };
    }),
  );
  const fulfilled = recentCommits.filter(
    (commit) => commit.status === 'fulfilled',
  );

  const mostRecent = fulfilled.reduce((latest, current) => {
    return new Date(current.value.date) > new Date(latest.value.date)
      ? current
      : latest;
  });

  const merged = fulfilled.reduce((acc, entry) => {
    Object.entries(entry.value.languages).forEach(([lang, bytes]) => {
      acc[lang] = (acc[lang] || 0) + bytes;
    });
    return acc;
  }, {});

  const total = Object.values(merged).reduce((sum, bytes) => sum + bytes, 0);

  const percentages = Object.fromEntries(
    Object.entries(merged).map(([lang, bytes]) => [
      lang,
      ((bytes / total) * 100).toFixed(1),
    ]),
  );

  const top3 = Object.fromEntries(
    Object.entries(percentages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3),
  );

  const result = {
    status: 'success',
    top3,
    commit: mostRecent.value,
    totalCommits,
  };

  activityCache.data = result;
  activityCache.lastFetched = now;

  res.json(result);
});

// test function
router.route('/commits').get(async (req, res) => {
  const response = await octokit.request(
    'GET /repos/{owner}/{repo}/commits?author=jordanfulawka',
    {
      owner: 'jordanfulawka',
      repo: 'cm-compiler',
    },
  );

  res.json({
    response,
  });
});

module.exports = router;
