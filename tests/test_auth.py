import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal, User, UserSession

class TestAuth(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.db = SessionLocal()
        # Clean up test users if they exist
        for username in ["test_auth_user", "test_auth_user_new"]:
            test_user = self.db.query(User).filter(User.username == username).first()
            if test_user:
                self.db.delete(test_user)
                self.db.commit()

    def tearDown(self):
        # Clean up test users if they exist
        for username in ["test_auth_user", "test_auth_user_new"]:
            test_user = self.db.query(User).filter(User.username == username).first()
            if test_user:
                self.db.delete(test_user)
                self.db.commit()
        self.db.close()

    def test_registration_and_login(self):
        # 1. Register user
        register_payload = {
            "username": "test_auth_user",
            "password": "testpassword123"
        }
        response = self.client.post("/api/auth/register", json=register_payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("token", data)
        self.assertEqual(data["user"]["username"], "test_auth_user")
        
        token = data["token"]

        # 2. Register again (should fail)
        response_dup = self.client.post("/api/auth/register", json=register_payload)
        self.assertEqual(response_dup.status_code, 400)

        # 3. Access protected endpoint without token
        response_protected = self.client.get("/api/settings")
        self.assertEqual(response_protected.status_code, 401)

        # 4. Access protected endpoint with token
        headers = {"Authorization": f"Bearer {token}"}
        response_protected = self.client.get("/api/settings", headers=headers)
        self.assertEqual(response_protected.status_code, 200)
        self.assertIn("availability", response_protected.json())

        # 5. Access /auth/me
        response_me = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(response_me.status_code, 200)
        self.assertEqual(response_me.json()["username"], "test_auth_user")

        # 6. Login
        login_payload = {
            "username": "test_auth_user",
            "password": "testpassword123"
        }
        response_login = self.client.post("/api/auth/login", json=login_payload)
        self.assertEqual(response_login.status_code, 200)
        login_data = response_login.json()
        self.assertIn("token", login_data)
        new_token = login_data["token"]

        # 7. Logout
        response_logout = self.client.post("/api/auth/logout", headers={"Authorization": f"Bearer {new_token}"})
        self.assertEqual(response_logout.status_code, 200)

        # 8. Check auth me after logout (should fail)
        response_me_after = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_token}"})
        self.assertEqual(response_me_after.status_code, 401)

    def test_profile_management(self):
        # 1. Register a user
        register_payload = {
            "username": "test_auth_user",
            "password": "testpassword123"
        }
        res = self.client.post("/api/auth/register", json=register_payload)
        self.assertEqual(res.status_code, 200)
        token = res.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Get profile
        res_profile = self.client.get("/api/auth/profile", headers=headers)
        self.assertEqual(res_profile.status_code, 200)
        self.assertEqual(res_profile.json()["username"], "test_auth_user")
        self.assertEqual(res_profile.json()["provider"], "local")

        # 3. Update username
        update_payload = {
            "username": "test_auth_user_new",
            "email": "test@domain.com"
        }
        res_update = self.client.patch("/api/auth/profile", json=update_payload, headers=headers)
        self.assertEqual(res_update.status_code, 200)
        self.assertEqual(res_update.json()["username"], "test_auth_user_new")
        self.assertEqual(res_update.json()["email"], "test@domain.com")

        # 4. Verify password update (incorrect current password should fail)
        password_payload_fail = {
            "current_password": "wrongpassword",
            "new_password": "newpassword123"
        }
        res_pwd_fail = self.client.patch("/api/auth/profile", json=password_payload_fail, headers=headers)
        self.assertEqual(res_pwd_fail.status_code, 401)

        # 5. Verify password update (correct credentials should succeed)
        password_payload = {
            "current_password": "testpassword123",
            "new_password": "newpassword123"
        }
        res_pwd = self.client.patch("/api/auth/profile", json=password_payload, headers=headers)
        self.assertEqual(res_pwd.status_code, 200)

        # 6. Verify login with new password works
        login_payload = {
            "username": "test_auth_user_new",
            "password": "newpassword123"
        }
        res_login = self.client.post("/api/auth/login", json=login_payload)
        self.assertEqual(res_login.status_code, 200)

        # 7. Delete account
        res_delete = self.client.delete("/api/auth/profile", headers=headers)
        self.assertEqual(res_delete.status_code, 200)

        # 8. Check auth me after deletion (should fail)
        res_me_deleted = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(res_me_deleted.status_code, 401)

if __name__ == '__main__':
    unittest.main()
