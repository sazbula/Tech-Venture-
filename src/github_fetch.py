"""
GitHub Repository Fetcher for Contextify

Downloads public GitHub repositories for analysis by RepoGraph.
"""

import requests
import zipfile
import io
import shutil
from pathlib import Path
from urllib.parse import urlparse


class GitHubFetchError(Exception):
    """Raised when fetching a GitHub repository fails."""
    pass


def parse_github_url(url: str) -> tuple[str, str]:
    """
    Parse a GitHub URL into (owner, repo).

    Handles formats:
    - https://github.com/owner/repo
    - https://github.com/owner/repo.git
    - github.com/owner/repo
    - owner/repo

    Args:
        url: GitHub repository URL or owner/repo string

    Returns:
        Tuple of (owner, repo)

    Raises:
        GitHubFetchError: If URL format is invalid
    """
    url = url.strip().rstrip("/")

    # Remove protocol if present
    if "://" in url:
        parsed = urlparse(url)
        path = parsed.path.strip("/")
    elif url.startswith("github.com"):
        path = url.replace("github.com/", "")
    else:
        # Assume it's owner/repo format
        path = url

    # Remove .git suffix if present
    path = path.removesuffix(".git")

    parts = path.split("/")
    if len(parts) < 2:
        raise GitHubFetchError(f"Invalid GitHub URL format: {url}")

    owner, repo = parts[0], parts[1]

    if not owner or not repo:
        raise GitHubFetchError(f"Could not parse owner/repo from: {url}")

    return owner, repo


def fetch_github_repo(
    owner: str,
    repo: str,
    branch: str = "main",
    dest: str | Path = "./repos",
    force: bool = False
) -> Path:
    """
    Download a public GitHub repository.

    Args:
        owner: Repository owner (username or organization)
        repo: Repository name
        branch: Branch to download (defaults to 'main', falls back to 'master')
        dest: Destination directory for downloaded repos
        force: If True, overwrite existing download

    Returns:
        Path to the extracted repository

    Raises:
        GitHubFetchError: If download fails
    """
    dest_path = Path(dest)
    dest_path.mkdir(parents=True, exist_ok=True)

    repo_path = dest_path / repo

    # Check if already downloaded
    if repo_path.exists():
        if not force:
            return repo_path
        shutil.rmtree(repo_path)

    # Try to download
    url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip"

    try:
        response = requests.get(url, timeout=60)

        if response.status_code == 404:
            # Try 'master' branch if 'main' fails
            if branch == "main":
                return fetch_github_repo(owner, repo, "master", dest, force)
            raise GitHubFetchError(
                f"Repository not found: {owner}/{repo} (branch: {branch})"
            )

        response.raise_for_status()

    except requests.RequestException as e:
        raise GitHubFetchError(f"Failed to download repository: {e}")

    # Extract the zip
    try:
        with zipfile.ZipFile(io.BytesIO(response.content)) as z:
            z.extractall(dest_path)
    except zipfile.BadZipFile as e:
        raise GitHubFetchError(f"Invalid zip file received: {e}")

    # Rename from repo-branch to just repo
    extracted_name = f"{repo}-{branch}"
    extracted_path = dest_path / extracted_name

    if extracted_path.exists():
        extracted_path.rename(repo_path)
    else:
        # Handle case where zip has different structure
        # Find the extracted directory
        for item in dest_path.iterdir():
            if item.is_dir() and item.name.startswith(repo):
                item.rename(repo_path)
                break
        else:
            raise GitHubFetchError("Could not find extracted repository directory")

    return repo_path


def fetch_from_url(
    url: str,
    dest: str | Path = "./repos",
    force: bool = False
) -> Path:
    """
    Convenience function to fetch a repo directly from URL.

    Args:
        url: GitHub repository URL
        dest: Destination directory
        force: If True, overwrite existing download

    Returns:
        Path to the extracted repository
    """
    owner, repo = parse_github_url(url)
    return fetch_github_repo(owner, repo, dest=dest, force=force)


def get_repo_info(owner: str, repo: str) -> dict:
    """
    Get basic information about a GitHub repository.

    Args:
        owner: Repository owner
        repo: Repository name

    Returns:
        Dictionary with repo info (name, description, default_branch, etc.)
    """
    url = f"https://api.github.com/repos/{owner}/{repo}"

    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        data = response.json()

        return {
            "name": data.get("name"),
            "full_name": data.get("full_name"),
            "description": data.get("description"),
            "default_branch": data.get("default_branch", "main"),
            "language": data.get("language"),
            "stars": data.get("stargazers_count"),
            "forks": data.get("forks_count"),
            "size": data.get("size"),  # in KB
            "html_url": data.get("html_url"),
        }
    except requests.RequestException:
        # Return minimal info if API fails (rate limiting, etc.)
        return {
            "name": repo,
            "full_name": f"{owner}/{repo}",
            "default_branch": "main",
        }


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python github_fetch.py <github_url>")
        print("Example: python github_fetch.py https://github.com/facebook/react")
        sys.exit(1)

    url = sys.argv[1]
    force = "--force" in sys.argv

    try:
        owner, repo = parse_github_url(url)
        print(f"Fetching {owner}/{repo}...")

        # Get repo info first
        info = get_repo_info(owner, repo)
        if info.get("description"):
            print(f"Description: {info['description']}")
        if info.get("language"):
            print(f"Language: {info['language']}")

        # Download
        path = fetch_github_repo(
            owner, repo,
            branch=info.get("default_branch", "main"),
            force=force
        )
        print(f"Downloaded to: {path}")

    except GitHubFetchError as e:
        print(f"Error: {e}")
        sys.exit(1)
