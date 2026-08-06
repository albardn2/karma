from datetime import timedelta
from flask_jwt_extended import create_access_token
from app import create_app
from models.common import User
from app.adapters.unit_of_work.sqlalchemy_unit_of_work import SqlAlchemyUnitOfWork
import sys
uid = sys.argv[1]
app = create_app()
with app.app_context():
    with SqlAlchemyUnitOfWork(account_uuid=None) as uow:
        u = uow.session.query(User).filter(User.uuid == uid).one()
        scopes = u.permission_scope.split(",")
        tok = create_access_token(identity=u.uuid,
            additional_claims={"scopes": scopes, "account_uuid": u.account_uuid},
            expires_delta=timedelta(days=1))
        print(tok)
