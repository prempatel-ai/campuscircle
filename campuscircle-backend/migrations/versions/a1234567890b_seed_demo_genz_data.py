"""seed demo gen-z engineering campus data

Revision ID: a1234567890b
Revises: f98765432101
Create Date: 2026-07-29 19:30:00.000000

"""
import uuid
import re
from datetime import datetime, timezone
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1234567890b'
down_revision: Union[str, None] = 'f98765432101'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Sample Gen-Z Engineering Demo Communities
COMMUNITIES = [
    {
        "name": "cs-grind",
        "description": "LeetCode, DSA, System Design & Late Night Coding 💻"
    },
    {
        "name": "campus-confessions",
        "description": "Late Night Exam Rants, Viva Survival & Campus Vibe 🤫"
    },
    {
        "name": "placements-referrals",
        "description": "Off-Campus Referrals, Resume Reviews & Tech Internships 🚀"
    },
    {
        "name": "tech-memes",
        "description": "Bugs, Coffee, 3 AM Deployments & Engineering Humour ☕"
    },
    {
        "name": "hostel-survival",
        "description": "Mess Food Reviews, Night Owls & Secret Maggi Hacks 🍜"
    }
]

DEMO_USERS = [
    {"username": "alex_dev", "email": "alex@spcevng.ac.in"},
    {"username": "neha_codes", "email": "neha@spcevng.ac.in"},
    {"username": "arjun_tech", "email": "arjun@spcevng.ac.in"},
    {"username": "rohit_builds", "email": "rohit@spcevng.ac.in"}
]

DEMO_POSTS = [
    {
        "community_name": "cs-grind",
        "author": "alex_dev",
        "title": "Who else is staying up till 3 AM fixing a segmentation fault? 💀",
        "content": "Pointers in C++ are literally personal. My code compiled with 0 errors but crashed on testcase 4. Pray for my viva tomorrow guys! #cpp #examgrind #viva #cs",
        "score": 42
    },
    {
        "community_name": "tech-memes",
        "author": "neha_codes",
        "title": "Pro tip for DBMS viva: SQL Joins explained simple 😭",
        "content": "INNER JOIN is mutual love. LEFT JOIN is one-sided crush. FULL OUTER JOIN is toxic relationship where everyone stays anyway. #dbms #sql #engineering #viva",
        "score": 89
    },
    {
        "community_name": "cs-grind",
        "author": "arjun_tech",
        "title": "Reached 200 LeetCode Problems Solved! 🚀",
        "content": "Started 3 months ago unable to solve two sum. Today solved my first hard DP problem! We making it out of Tier-3 engineering with this one! #leetcode #dsa #placements #faang",
        "score": 67
    },
    {
        "community_name": "hostel-survival",
        "author": "rohit_builds",
        "title": "Mess food today is literally chemical warfare 😭",
        "content": "Why is the paneer harder than the Compiler Design midterm? Any senior in Block B got an induction stove for Maggi? #hostellife #messfood #survival",
        "score": 53
    },
    {
        "community_name": "placements-referrals",
        "author": "neha_codes",
        "title": "Off-Campus Internship Referral Thread (Summer 2026) 💼",
        "content": "Drop your tech stack and GitHub link below! My team is looking for React + Python interns. Let's get everyone placed! #referrals #internship #hiring #careers",
        "score": 112
    },
    {
        "community_name": "tech-memes",
        "author": "alex_dev",
        "title": "Building an AI Agent to auto-reply to professor emails 🤖",
        "content": "Tired of manually replying 'Pushed to main' to lab submission emails so I wrote a Python FastAPI backend + LLM script. Open sourcing it tonight! #ai #python #buildinpublic #sideproject",
        "score": 78
    }
]

HASHTAG_REGEX = re.compile(r'#([A-Za-z0-9_]{1,30})')


def upgrade() -> None:
    # 1. Fetch university_id for spcevng.ac.in (or default university)
    bind = op.get_bind()
    res = bind.execute(sa.text("SELECT id FROM universities WHERE email_domain = 'spcevng.ac.in' LIMIT 1;"))
    row = res.fetchone()
    if not row:
        res = bind.execute(sa.text("SELECT id FROM universities LIMIT 1;"))
        row = res.fetchone()

    if not row:
        return

    uni_id = str(row[0])

    # 2. Seed Users
    user_map = {}
    default_pw_hash = "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQOEg6Lruj3vjPGga31lW"  # bcrypt 'password123'
    for u in DEMO_USERS:
        u_id = str(uuid.uuid4())
        user_map[u["username"]] = u_id
        bind.execute(
            sa.text(
                "INSERT INTO users (id, university_id, email, username, password_hash, email_verified, role, is_banned) "
                "VALUES (:id, :uni_id, :email, :username, :pw_hash, true, 'student', false) "
                "ON CONFLICT (email) DO NOTHING;"
            ),
            {"id": u_id, "uni_id": uni_id, "email": u["email"], "username": u["username"], "pw_hash": default_pw_hash}
        )

    # 3. Seed Communities
    comm_map = {}
    for c in COMMUNITIES:
        c_id = str(uuid.uuid4())
        comm_map[c["name"]] = c_id
        author_id = user_map["alex_dev"]
        bind.execute(
            sa.text(
                "INSERT INTO communities (id, university_id, created_by, name, description) "
                "VALUES (:id, :uni_id, :created_by, :name, :description) "
                "ON CONFLICT (university_id, name) DO NOTHING;"
            ),
            {"id": c_id, "uni_id": uni_id, "created_by": author_id, "name": c["name"], "description": c["description"]}
        )

    # Re-fetch actual community IDs from DB in case of conflict
    res_c = bind.execute(sa.text("SELECT id, name FROM communities WHERE university_id = :uni_id;"), {"uni_id": uni_id})
    for r in res_c.fetchall():
        comm_map[r[1]] = str(r[0])

    # Re-fetch actual user IDs
    res_u = bind.execute(sa.text("SELECT id, username FROM users WHERE university_id = :uni_id;"), {"uni_id": uni_id})
    for r in res_u.fetchall():
        user_map[r[1]] = str(r[0])

    # 4. Seed Posts, Tags, and PostTags
    tag_map = {}
    for p in DEMO_POSTS:
        post_id = str(uuid.uuid4())
        c_id = comm_map.get(p["community_name"])
        u_id = user_map.get(p["author"])

        if not c_id or not u_id:
            continue

        bind.execute(
            sa.text(
                "INSERT INTO posts (id, community_id, author_id, title, content, score, is_deleted) "
                "VALUES (:id, :c_id, :u_id, :title, :content, :score, false);"
            ),
            {
                "id": post_id,
                "c_id": c_id,
                "u_id": u_id,
                "title": p["title"],
                "content": p["content"],
                "score": p["score"]
            }
        )

        # Extract tags
        text_content = f"{p['title']} {p['content']}"
        matches = HASHTAG_REGEX.findall(text_content)
        for tag_name in set(m.lower() for m in matches):
            if tag_name not in tag_map:
                res_t = bind.execute(
                    sa.text("SELECT id FROM tags WHERE university_id = :uni_id AND name = :name LIMIT 1;"),
                    {"uni_id": uni_id, "name": tag_name}
                )
                t_row = res_t.fetchone()
                if t_row:
                    t_id = str(t_row[0])
                else:
                    t_id = str(uuid.uuid4())
                    bind.execute(
                        sa.text("INSERT INTO tags (id, university_id, name) VALUES (:id, :uni_id, :name);"),
                        {"id": t_id, "uni_id": uni_id, "name": tag_name}
                    )
                tag_map[tag_name] = t_id
            else:
                t_id = tag_map[tag_name]

            # Link post_tags
            bind.execute(
                sa.text("INSERT INTO post_tags (post_id, tag_id) VALUES (:p_id, :t_id) ON CONFLICT DO NOTHING;"),
                {"p_id": post_id, "t_id": t_id}
            )


def downgrade() -> None:
    pass
